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

import { parseTasks, QUEUE_STUB_BODY, QUEUE_STUB_META } from './dashboard-guard-core.mjs'
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

/**
 * ONE GROUP CARD, its point cards nested inside (point 452).
 *
 * The markup is deliberately the CARD shape the board's parsers already read,
 * one level up: `class="group"` so `queueCard`/`toNow` cannot mistake it for a
 * point card, `data-group` so the reader's restore script can address a group by
 * name, and — for the unbundled group only — a leading line carrying the reason
 * those points stand outside every bundle.
 *
 * NO ORDER LINE (user 30.07.2026: "die geht ja schon aus der Reihenfolge hervor,
 * in der die Karten aufgeführt werden"). The nested cards ARE the order; naming
 * it again above them said the same thing twice and cost a phone screen's worth
 * of height per group.
 */
export function renderQueueGroup({ name, entries = [], count, meta, reason = null }) {
  const lead = [reason].filter(Boolean)
  return (
    `<details class="group" data-group="${esc(name)}">\n` +
    `  <summary><span class="t">${esc(name)} · ${Number(count) || entries.length} Punkte</span>` +
    `<span class="right"><span class="meta">${esc(meta)}</span></span></summary>\n` +
    `  <div class="body">\n${lead.map((p) => `    <p>${esc(p)}</p>\n`).join('')}` +
    `${renderQueueCards(entries)}  </div>\n</details>\n`
  )
}

/** Every group, in order — what the Warteschlange section holds when grouped. */
export function renderQueueGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map(renderQueueGroup).join('')
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
export function buildQueueSection(html, { open = [], data = null, exclude = [], titles = {}, packages = null } = {}) {
  const doc = String(html ?? '')
  const { from, end } = queueSectionBounds(doc)
  const entries = queueEntries({ open, data, exclude, titles })
  // GROUPED WHEN THE DOC IS THERE, FLAT WHEN IT IS NOT (point 452). An
  // unreadable `docs/work-packages.md` must cost the grouping, never the board:
  // a flat queue is the old picture, a missing one is the staleness this whole
  // projection exists to end.
  const groups = packages ? groupQueueEntries(entries, packages) : null
  const body = groups && groups.length ? renderQueueGroups(groups) : renderQueueCards(entries)
  return { html: `${doc.slice(0, from)}\n${body}${doc.slice(end)}`, entries, groups }
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

// ═══ Point 452 — the board did not know its own bundles ═══════════════════
// The work order has been worked in BUNDLES since 29.07.2026 and
// `docs/work-packages.md` holds all of them, but the queue rendered point after
// point: "Auf dem Dashboard sehe ich nur Einzelschritte - keine Bündel" (user
// 30.07.2026), and with a hundred cards in a flat list, "ich sehe nicht, was
// kommt und wann". So the queue renders one GROUP CARD per bundle with the
// point cards nested inside it — a `<details>` level between the section and the
// card, which is also why the reader's open-state script keeps working: it
// restores `<details>` elements, and a group is one.

/** The document that owns the bundles, their order and the unbundled reasons. */
export const WORK_PACKAGES_PATH = 'docs/work-packages.md'

/** The group the points in no bundle land in — they must never simply vanish. */
export const UNBUNDLED_GROUP_NAME = 'Ohne Bündel'

/**
 * Why those points are unbundled, in the German the board is written in. The
 * doc states the reasons per point in English; this is the one sentence that
 * carries them onto the board, and it is a constant so it is one edit.
 */
export const UNBUNDLED_GROUP_REASON =
  'Nicht gebündelt: die großen Audits durchsuchen die ganze Codebasis und würden jedes Bündel ' +
  'verschlucken, die Releases hängen an einem vollständigen Abschlusslauf statt an einem Branch, ' +
  'und einzelne Punkte sind hinter einen anderen gehängt.'

/**
 * WHETHER A GROUP STARTS OPEN — the ONE lever, so flipping it is a one-value
 * change (user decision still open, 30.07.2026).
 *
 * 'collapsed' is the phone case the user described: about a dozen lines of
 * overview instead of a hundred cards. It is achieved by emitting NO `open`
 * attribute, which is also the house rule — `auditDashboard` blocks any
 * `<details open>` on the board, because a hard-coded attribute overrides what
 * the reader themselves opened on every refresh. The other two readings
 * ('current' — only the bundle being worked, 'all') therefore cannot be markup:
 * they belong to the board's own restore script, which addresses a group by the
 * `data-group` attribute every group card carries for exactly that purpose.
 */
export const QUEUE_GROUP_DEFAULT_STATE = 'collapsed'

/**
 * The bundles, their working order and the unbundled points, read from
 * `docs/work-packages.md`. The doc is the single source: a bundle added there
 * appears on the board without a code change.
 *
 * Total by contract — this feeds a board rebuild that a hook may call, so a
 * half-written doc degrades to "no grouping", never to a throw.
 */
export function parseWorkPackages(text) {
  const doc = normaliseLineEndings(text)
  const bundles = []
  // The table rows: | **Name** | Id | What it is | Points |. The NAME is what the
  // board shows; the letter is the table's internal id and never leaves the doc
  // (user 30.07.2026: "Die Buchstaben sagen nichts aus").
  for (const row of doc.split('\n')) {
    const m = row.match(/^\|\s*\*\*([^*|]+)\*\*\s*\|\s*([A-Z])\s*\|[^|]*\|([^|]*)\|/)
    if (!m) continue
    // "the rest landed 30.07.2026 (308, 410, …)" names CLOSED points in the same
    // cell — harmless, the projection only ever renders OPEN ones. The DATE is
    // not harmless: its day and month read as points 30 and 7, which would hand
    // two unrelated points to whichever bundle mentions a date. Struck first.
    const points = [...m[3].replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, ' ').matchAll(/\b(\d{1,4})\b/g)]
      .map((x) => Number(x[1]))
      .filter((n) => n > 0 && n < 10000)
    bundles.push({ id: m[2], name: m[1].trim(), points: [...new Set(points)] })
  }
  const known = new Map(bundles.map((b) => [b.name, b]))

  // The working order: the bold names of the "Order of work" section, in the
  // order they are written, arrows and all. A bold span that names no bundle
  // ("v0.3 with the full closing") is simply not one; a bundle named with a
  // trailing word ("Urlaubsfestigkeit first") still is.
  const orderSection = doc.slice(doc.indexOf('## Order of work'))
  const order = []
  for (const bold of orderSection.matchAll(/\*\*([^*]+)\*\*/g)) {
    for (const part of bold[1].split(/→|->/)) {
      const candidate = part.trim()
      const hit = [...known.keys()].find((name) => candidate === name || candidate.startsWith(`${name} `))
      if (hit && !order.includes(hit)) order.push(hit)
    }
  }

  // The unbundled bullets — every number in the "Not bundled" list, up to the
  // next heading. Their reasons stay in the doc; the board carries the one
  // German sentence above.
  const from = doc.indexOf('**Not bundled**')
  const unbundled = []
  if (from >= 0) {
    const end = doc.indexOf('\n## ', from)
    for (const bullet of doc.slice(from, end < 0 ? undefined : end).split('\n')) {
      if (!bullet.trimStart().startsWith('- ')) continue
      for (const x of bullet.matchAll(/\*\*([\d,\s]+)\*\*/g)) {
        for (const n of x[1].split(/[,\s]+/)) if (/^\d+$/.test(n)) unbundled.push(Number(n))
      }
    }
  }
  return { bundles, order, unbundled: [...new Set(unbundled)] }
}

/**
 * The rendered entries, grouped into their bundles (point 452).
 *
 * Group order follows the doc's "Order of work"; a bundle the order forgets
 * keeps its table position behind the named ones, and the unbundled group is
 * always LAST ("the big audits last"). Inside a group the points keep the order
 * the doc lists them in — that is the order they will be worked.
 *
 * THE INVARIANT: every entry lands in exactly one group. An entry in no bundle
 * goes to the unbundled group whether or not the doc mentions it, because the
 * alternative is a point that silently disappears off the board — the failure
 * the whole projection exists to end.
 */
export function groupQueueEntries(entries, packages) {
  const list = Array.isArray(entries) ? entries : []
  // Coerced, not defaulted: a destructuring default only fires on `undefined`,
  // and this reads a hand-editable doc through a parser a hook calls.
  const bundles = Array.isArray(packages?.bundles) ? packages.bundles : []
  const order = Array.isArray(packages?.order) ? packages.order : []
  const named = order.map((n) => bundles.find((b) => b?.name === n)).filter(Boolean)
  const ordered = [...named, ...bundles.filter((b) => !named.includes(b))]
  const home = new Map()
  for (const bundle of ordered) {
    for (const p of Array.isArray(bundle.points) ? bundle.points : []) if (!home.has(p)) home.set(p, bundle.name)
  }

  const groups = new Map(
    ordered.map((b) => [b.name, { name: b.name, rank: Array.isArray(b.points) ? b.points : [], entries: [] }]),
  )
  const rest = []
  for (const entry of list) {
    const name = home.get(entry.point)
    if (name && groups.has(name)) groups.get(name).entries.push(entry)
    else rest.push(entry)
  }
  const out = []
  for (const group of groups.values()) {
    if (!group.entries.length) continue // a bundle whose points are all closed
    const at = (e) => {
      const i = group.rank.indexOf(e.point)
      return i < 0 ? Number.MAX_SAFE_INTEGER : i
    }
    out.push(summariseGroup(group.name, [...group.entries].sort((a, b) => at(a) - at(b))))
  }
  if (rest.length) out.push(summariseGroup(UNBUNDLED_GROUP_NAME, rest, UNBUNDLED_GROUP_REASON))
  return out
}

/** "~2,5 h · Feature" → 2.5 — the notation the queue header already uses. */
function metaHours(meta) {
  const m = String(meta ?? '').match(/~\s*(\d+(?:[.,]\d+)?)\s*h/)
  return m ? Number(m[1].replace(',', '.')) : null
}

/** One group with the numbers its summary shows: member count and estimate sum. */
function summariseGroup(name, entries, reason = null) {
  const hours = entries.map((e) => metaHours(e.meta)).filter((h) => h != null)
  const sum = hours.reduce((a, b) => a + b, 0)
  return {
    name,
    entries,
    reason,
    count: entries.length,
    hours: hours.length ? sum : null,
    // The audit demands a "~<n> h" duration on every queue card, or the NAMED
    // "no estimate yet" marker — nothing in between. A group nobody has
    // estimated therefore says so in exactly that wording rather than inventing
    // a sum of nothing.
    meta: hours.length ? `~${String(Math.round(sum * 2) / 2).replace(/\.0$/, '').replace('.', ',')} h` : QUEUE_STUB_META,
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
