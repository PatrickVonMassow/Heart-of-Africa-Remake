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
//     TASKS.md (which points are open, and in which order)  +  board-queue.json
//     (title, body and estimate per point)
//                              ↓  buildQueueSection
//                        the Warteschlange HTML
//
// THE ORDER IS THE WORK ORDER'S, AND IS STORED NOWHERE (point 608, 10.08.2026).
// Until then the data file carried its own `order` list, and the two drifted: on
// 10.08.2026 the work order was re-sequenced TWICE — four points pushed behind
// 602, five throughput levers pulled to the head — the board was rebuilt and
// republished both times, and it kept showing the old sequence, because the
// generator read that stored list. The user found it before any check did; the
// board is the one surface he steers the batch by. One fact, one home: the
// sequence of open points in TASKS.md IS the queue order, and the data file
// keeps only what is genuinely its own — title, body, estimate.
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

import {
  parseTasks,
  QUEUE_GATED_META,
  QUEUE_STUB_BODY,
  QUEUE_STUB_META,
  TRANSLITERATION_STEMS,
} from './dashboard-guard-core.mjs'
import { normaliseLineEndings } from './board-core.mjs'
import { SINGLE_PARAGRAPH_WORD_BUDGET, WORD_BUDGET } from './dashboard-conciseness-guard-core.mjs'
import { gateSets } from './user-gate-core.mjs'
// The pool cap is the width of the queue's front (point 712) — three slots,
// three candidates. It is IMPORTED rather than restated: a second 3 in this file
// would be a second home for the number CLAUDE.md §6 states.
import { POOL_CAP } from './batch-in-flight-core.mjs'

// The stub meta is DEFINED beside the audit rule that exempts it and re-exported
// here: two copies of that string would be a block loop waiting to happen. The
// gated meta (point 450) travels the same way.
export { QUEUE_GATED_META, QUEUE_STUB_BODY, QUEUE_STUB_META }

/** Where the queue's prose lives (git-ignored, like the board itself). */
export const QUEUE_DATA_PATH = '.claude/board-queue.json'

/** Rebuild the Warteschlange from the work order — the remedy for any drift. */
export const QUEUE_REBUILD_CMD = 'node scripts/board-queue.mjs'

/**
 * The bug-FINDING / QA-framework point numbers; every other open point is a fix.
 *
 * They live HERE, with the ranking that uses them (point 608). They were the
 * queue-order guard's until the guard had to compare the rendered sequence
 * against the derived one — that made the guard a consumer of `queueOrder`, and
 * a constant owned by the consumer would have closed an import cycle. The guard
 * re-exports both, so every caller that named them there still finds them.
 *
 * 181 is a concrete WebGPU BUG (a fix), not a finder — it is intentionally NOT
 * here, so it may sit among the fixes ahead of the finder/closing block. 200
 * (verify-script robustness) and 285 (leak/accumulation hunt) are QA-framework
 * finders too and belong in this block (added 24.07.2026, user queue-order call).
 */
export const FINDER_POINTS = new Set([184, 200, 203, 204, 205, 207, 285])

/** The release tag point. It keeps the POSITION the work order gives it (user
 *  10.08.2026: v0.3 ships once the communication mechanic and the critical bugs
 *  are done — the feature work and the audits follow it, they do not gate it), and
 *  it stays exempt from the fixes-before-finders rule, which orders the work that
 *  comes BEFORE the release. */
export const RELEASE_TAG_POINT = 174

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

/** The points whose card says it waits on the USER, not on work (point 450). */
export function gatedEntryPoints(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e?.gated).map((e) => e.point)
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
    // The import decodes now, so decoding again here would eat a second layer
    // from a title that legitimately spells out an entity.
    if (isUntranslatedTitle(entry.title, n, titles)) untranslated.push(n)
    // A GATED card carries no estimate BY DESIGN (point 450) — reporting it as
    // unestimated would nag for a duration the rule itself forbids, every turn,
    // for as long as the user is away.
    if (!entry.estimate && !entry.gated) unestimated.push(n)
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
  // A stored `order` from before point 608 is DROPPED here rather than migrated:
  // the work order is the sequence now, so keeping the list would only give a
  // second home to a fact that has one. The next write leaves it out of the file.
  const points = {}
  const entries = src.points && typeof src.points === 'object' ? src.points : {}
  for (const [key, value] of Object.entries(entries)) {
    const n = Number(key)
    if (!Number.isInteger(n) || n <= 0 || !value || typeof value !== 'object') continue
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    points[n] = { title: str(value.title), body: paragraphs(value.body), estimate: str(value.estimate) }
  }
  return { points }
}

/**
 * The order the cards are rendered in — DERIVED from the work order (point 608).
 *
 * `open` is the sequence of open points as TASKS.md lists them, read through
 * `scripts/tasks-source.mjs`; that sequence IS the plan, and re-sequencing the
 * work order is how the plan is changed. Nothing here stores a second one.
 *
 * The rank rules stay exactly what they were — they are a VIEW on that order,
 * not a competing order, and each is stable, so two points of equal rank keep
 * the work order's sequence between them:
 *   1. the bug-FINDING / QA points sink to the BACK. That rule (memory
 *      queue-order-fixes-before-finders) is enforced by queue-order-guard at
 *      turn end; satisfying it by CONSTRUCTION means a newly appended fix can
 *      never trip it. The release tag is NOT sunk (user 10.08.2026): it sits
 *      where the work order puts it, right behind the work that gates it.
 *   2. the USER GATE (point 450), at both ends: a point ANSWERED by the user
 *      goes to the very HEAD — it waited on him, so it does not queue behind
 *      work appended while it waited — and a point still WAITING on him goes
 *      behind everything, because it cannot be worked at all. That is the whole
 *      "vacation mode": a fortnight of silence moves the gated cards out of the
 *      way instead of jamming the queue at its head.
 */
export function queueOrder(open, gates) {
  const { gated, answered } = normaliseGates(gates)
  const wanted = (Array.isArray(open) ? open : []).map(Number).filter((n) => Number.isInteger(n) && n > 0)
  const all = [...new Set(wanted)]
  const rank = (n) => {
    if (gated.has(n)) return 3
    if (answered.has(n)) return -1
    return FINDER_POINTS.has(n) ? 1 : 0
  }
  return all
    .map((n, i) => ({ n, i, rank: rank(n) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.n)
}

/**
 * The gates in the shape this module works with: two Sets and the since-stamps.
 * Accepts the raw work-order text, a `parseUserGates` result, or an already
 * normalised object — a caller that has one must not have to re-read the file.
 */
export function normaliseGates(gates) {
  if (gates && gates.gated instanceof Set) {
    return { gated: gates.gated, answered: gates.answered instanceof Set ? gates.answered : new Set(), since: gates.since instanceof Map ? gates.since : new Map() }
  }
  if (gates === null || gates === undefined) return { gated: new Set(), answered: new Set(), since: new Map() }
  return gateSets(gates)
}

/**
 * The card meta of a point waiting on the user (point 450) — German, because it
 * is what the user reads on his phone, and the ONE thing a collapsed card shows
 * beside its title. The waiting-since date is appended in day.month form, the
 * board's own convention; a gate with no stamp simply omits it.
 */
export function gatedMeta(since) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(since ?? ''))
  return m ? `${QUEUE_GATED_META} (seit ${m[3]}.${m[2]}.)` : QUEUE_GATED_META
}

/**
 * The cards to render: every OPEN point that no other section already claims,
 * in queue order, each with its prose or an explicit stub.
 *
 * `exclude` is the double-listing guard (invariant 4b): the caller passes the
 * points the now-cards, "Von dir zu klären" and Erledigt already hold.
 *
 * `gates` is the user gate (point 450). A gated point keeps its card — dropping
 * it would break the completeness rule, and hiding what waits is the opposite of
 * what the user needs — but the card says WAITING ON YOU where a duration would
 * otherwise stand, so nothing on the board reads as work about to start. (A
 * gated point that already has its "Von dir zu klären" card is excluded by the
 * caller anyway; this is the honest state of the window before that card exists,
 * or after somebody forgot it.)
 */
export function queueEntries({ open = [], data = null, exclude = [], titles = {}, gates = null } = {}) {
  const { points } = normaliseQueueData(data)
  const g = normaliseGates(gates)
  const skip = new Set((Array.isArray(exclude) ? exclude : [...exclude]).map(Number))
  const out = []
  for (const point of queueOrder(open, g)) {
    if (skip.has(point)) continue
    const entry = points[point] ?? { title: null, body: null, estimate: null }
    const stub = !entry.body
    const title = entry.title || titles[point] || `Punkt ${point}`
    const gated = g.gated.has(point)
    out.push({
      point,
      title,
      body: entry.body ?? [QUEUE_STUB_BODY],
      meta: gated ? gatedMeta(g.since.get(point)) : entry.estimate || QUEUE_STUB_META,
      stub,
      gated,
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

/** The fixed half of the card an undrainable request becomes — ours, so it is
 *  never neutralised, and `vdzk-remove` finds the card by it. */
export const BLOCKED_CARD_PREFIX = 'Anfrage nicht übernehmbar: '

/**
 * The title of the decision card a request that cannot be carried in becomes.
 *
 * The deposit's own title goes through the SAME neutralisation as the queue card
 * (four-eyes finding 4, Fable 5, 31.07.2026): it was written in another window
 * and lands on a card the OWNER publishes, so a path, a `§`, a point reference
 * or a shell-mangled umlaut would be judged on the owner's turn, for text it
 * never wrote. The `--blocked` path passed it through raw while the queue card
 * already routed through `boardSafeTitle`.
 */
export function blockedCardTitle(title) {
  return `${BLOCKED_CARD_PREFIX}${boardSafeTitle(title)}`
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
export function buildQueueSection(html, { open = [], data = null, exclude = [], titles = {}, requests = [], gates = null } = {}) {
  const doc = String(html ?? '')
  const { from, end } = queueSectionBounds(doc)
  const entries = queueEntries({ open, data, exclude, titles, gates })
  const cards = `${renderQueueCards(entries)}${renderRequestsCard(requests)}`
  return { html: `${doc.slice(0, from)}\n${cards}${doc.slice(end)}`, entries }
}

/** One HTML fragment as the plain sentence it renders to. */
const cardText = (html) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Seed the data file from a board that still carries a hand-written queue — the
 * one-time migration, so the transition to the generator does not throw the
 * existing prose away. Reads only the Warteschlange section.
 *
 * EACH `<p>` STAYS ITS OWN PARAGRAPH (point 530). The body used to be stripped
 * to one flat sentence run, so a round trip through the board — which renders
 * one `<p>` per stored paragraph — silently pressed every card into a single
 * block, the exact shape the conciseness guard rejects. 46 cards lost their
 * split in one run on 06.08.2026, and the JSON is git-ignored, so nothing but
 * the published board still held the structure.
 */
export function importQueueFromHtml(html) {
  const doc = String(html ?? '')
  let section = ''
  try {
    const { from, end } = queueSectionBounds(doc)
    section = doc.slice(from, end)
  } catch {
    return { points: {} }
  }
  const points = {}
  for (const chunk of section.split(/<details\b/).slice(1)) {
    const summary = (chunk.match(/<summary>([\s\S]*?)<\/summary>/) ?? [])[1] ?? ''
    const num = summary.match(/class="num">\s*(\d+)\s*</)
    if (!num) continue
    const point = Number(num[1])
    const title = (summary.match(/class="t">([\s\S]*?)<\/span>/) ?? [])[1] ?? ''
    const metaRaw = (summary.match(/class="meta">([^<]*)</) ?? [])[1] ?? ''
    const bodyHtml = (chunk.match(/<div class="body[^"]*">([\s\S]*)$/) ?? [])[1] ?? ''
    const paras = [...bodyHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => cardText(m[1])).filter(Boolean)
    // A card with no <p> at all (a hand-written board) still yields its text.
    const body = paras.length ? paras : [cardText(bodyHtml)].filter(Boolean)
    // THE CARD SEQUENCE IS NOT IMPORTED (point 608): the board's order is a
    // rendering of the work order, so reading it back would only re-create the
    // second home this point removed.
    // THE GATED META IS NOT AN ESTIMATE (point 450). Importing it would store
    // "wartet auf deine Entscheidung" as the point's duration, and one rebuild
    // later the card would carry that string for ever — even after the answer.
    const isGated = metaRaw.trim().startsWith(QUEUE_GATED_META)
    points[point] = {
      gated: isGated || undefined,
      // UNESCAPED, like the body (four-eyes finding 2): the card renders its
      // title through `esc`, so storing it as read would put `&amp;amp;` on the
      // public board one rebuild later — and the escaped form never matches the
      // work order's plain headline, so the fallback-title report misfires too.
      title: unesc(title).trim() || null,
      // The generator's stub is not prose anybody wrote: importing it as a body
      // would make the card count as described and silence the "no prose yet"
      // report for ever.
      body: body.length && body.join(' ') !== QUEUE_STUB_BODY ? body : null,
      estimate: metaRaw.trim() && metaRaw.trim() !== QUEUE_STUB_META && !isGated ? metaRaw.trim() : null,
    }
  }
  return { points }
}

/**
 * The stored data, from the file's raw bytes — or a LOUD refusal (point 530,
 * four-eyes finding 1).
 *
 * `readJson` answers `null` for a file that does not exist and for one that no
 * longer parses, and every command here treats `null` as "nothing stored yet":
 * `import` would start from the board alone and `set` would write a file holding
 * its one entry. Either silently discards the prose of every point the board
 * does not currently render — a card promoted to the now-section or to "Von dir
 * zu klären" is exactly that. The file is documented as hand-editable and is
 * written while a batch runs, so a torn or half-typed one is a case, not a
 * curiosity. An ABSENT file still means "nothing yet"; an unreadable one stops
 * the command.
 */
export function parseQueueDataFile(text, { path = QUEUE_DATA_PATH } = {}) {
  if (text === null || text === undefined) return null
  if (!String(text).trim()) return null
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(
      `${path} exists but does not parse (${e.message}). Refusing to continue: every command here would ` +
        'treat it as empty and rewrite it, losing the prose of each point the board does not currently show. ' +
        'Repair the file (or move it aside deliberately), then run the command again.',
    )
  }
}

/**
 * AN IMPORT ADDS, IT NEVER OVERWRITES (point 530).
 *
 * `import` was written as a one-time migration and behaved like one: it replaced
 * the whole data file with whatever the board's HTML happened to say. Run again
 * later — which filing a single new point invites — it wrote every card back as
 * one flat paragraph and took the hand-written split of 46 cards with it. The
 * file is git-ignored, so nothing could restore it.
 *
 * So the merge is strictly additive: a point the data already knows keeps every
 * field it stores, and only a field it has NOTHING for is filled from the board.
 * A point the data does not know yet is taken over whole. No sequence is merged
 * — since point 608 the work order alone decides it.
 */
export function mergeQueueImport(existing, imported, { titles = {} } = {}) {
  const base = normaliseQueueData(existing)
  const add = normaliseQueueData(imported)
  const points = { ...base.points }
  const added = []
  for (const [key, raw] of Object.entries(add.points)) {
    const n = Number(key)
    const prev = points[n]
    // A TITLE THE GENERATOR ITSELF FELL BACK TO IS NOT DATA. Importing "Punkt
    // 465" or the work order's English headline would freeze the fallback into
    // the file, where it outranks the work order for ever and stops being
    // reported as still untranslated.
    const entry = { ...raw, title: isUntranslatedTitle(raw.title, n, titles) ? null : raw.title }
    // A card the board shows as a bare stub carries nothing to import; storing
    // the empty record would only make the data file grow one key per rebuild.
    if (!entry.title && !entry.body && !entry.estimate) continue
    if (!prev) {
      points[n] = entry
      added.push(n)
      continue
    }
    points[n] = {
      title: prev.title ?? entry.title,
      body: prev.body ?? entry.body,
      estimate: prev.estimate ?? entry.estimate,
    }
  }
  return { data: { points }, added: added.sort((a, b) => a - b), kept: Object.keys(base.points).length }
}

/**
 * The cards whose stored body would break the board's conciseness rule — checked
 * HERE, at the write, not only at the turn end (point 530).
 *
 * The turn-end guard reads the published HTML, which is hours downstream of the
 * data that produced it; by then the paragraphs are already gone and the only
 * remedy is retyping them. The same two length rules therefore decide whether a
 * body may be STORED. Technical density is left to the turn-end guard: it judges
 * prose a human wrote, and an import must not refuse to carry a card over for it.
 */
export function queueImportOffenders(data) {
  const { points } = normaliseQueueData(data)
  const out = []
  for (const [key, entry] of Object.entries(points)) {
    const body = entry.body
    if (!body) continue
    const words = body.reduce((n, p) => n + (p.match(/\S+/g) ?? []).length, 0)
    const reasons = []
    if (words > WORD_BUDGET) reasons.push(`${words} words (budget ${WORD_BUDGET}) — too verbose`)
    if (words > SINGLE_PARAGRAPH_WORD_BUDGET && body.length <= 1)
      reasons.push(`one unbroken paragraph of ${words} words — split it (budget ${SINGLE_PARAGRAPH_WORD_BUDGET})`)
    if (reasons.length) out.push({ point: Number(key), words, paragraphs: body.length, reason: reasons.join('; ') })
  }
  return out.sort((a, b) => a.point - b.point)
}

/** Write one point's prose into the data (returns a NEW object — pure). */
export function setQueueEntry(data, point, { title, body, estimate } = {}) {
  const n = Number(point)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`board: not a point number: ${point}`)
  assertNotFlagValue(title, 'title')
  assertNotFlagValue(Array.isArray(body) ? body[0] : body, 'body')
  assertNotFlagValue(estimate, 'estimate')
  const { points } = normaliseQueueData(data)
  const prev = points[n] ?? { title: null, body: null, estimate: null }
  const pick = (next, old) => (typeof next === 'string' && next.trim() ? next.trim() : old)
  return {
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

/** The points the work order records as FINISHED — its ticks. A landed point
 *  moves into `docs/tasks-archive.md` carrying its `- [x]`, so the archive text
 *  is where these come from; unlike "the point is not in the open order", a tick
 *  is positive evidence that a half-written file cannot fabricate. */
export function closedPointsOf(tasksText) {
  return parseTasks(String(tasksText ?? '')).done
}

// ---- THE QUEUE BINDS THE PICKER (point 712) --------------------------------
//
// `queueOrder` above has ranked the board since point 608, and the board has
// agreed with it since — but NOTHING asked it which point may be STARTED. On
// 17.08.2026 point 697, a tier-3 polish defect, was commissioned while the
// derived sequence read `700 701 707 708 711 705 706 710 662 …`; no guard fired,
// because every existing rule judges the ranking's completeness, the board's
// agreement with it and the honesty of its cards — never the pick.
//
// So the decision lives HERE, beside the ranking it reads, and no second list is
// introduced: the front of the queue is `queueOrder`'s own head. What the picker
// may open is decided from that alone.

/** How an override is recorded, and where it becomes visible afterwards. Both
 *  are named by the refusal — a rule whose remedy is not in its own message is a
 *  rule the reader has to go and look up. */
export const COMMISSION_OVERRIDE_CMD = 'node scripts/commission-guard.mjs --override <N> --reason "<why>"'

/** The reporting command that prints every recorded override and park. */
export const COMMISSION_STATUS_CMD = 'node scripts/commission-guard.mjs --status'

/**
 * The front-most WORKABLE candidates of the queue. PURE.
 *
 * "Workable" is the whole subtlety: the head of `queueOrder` may hold points
 * that cannot be started at all — one waiting on the user (point 450), one whose
 * branch is already open — and a front that named those would refuse everything
 * while offering nothing. Both are SKIPPED, so the window is always `count` real
 * candidates deep whenever the queue holds that many.
 *
 * `count` is the pool cap, deliberately: three slots, three candidates, so the
 * three agents the pool may run are exactly the three points at the front.
 */
export function frontCandidates({ open = [], gates = null, inFlight = [], count = POOL_CAP } = {}) {
  const g = normaliseGates(gates)
  const busy = new Set((Array.isArray(inFlight) ? inFlight : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))
  const want = Number.isFinite(count) && count > 0 ? Math.floor(count) : POOL_CAP
  const out = []
  for (const n of queueOrder(open, g)) {
    if (g.gated.has(n) || busy.has(n)) continue
    out.push(n)
    if (out.length >= want) break
  }
  return out
}

/**
 * MAY WORK BE OPENED ON THIS POINT? PURE.
 *
 * Returns { allowed, point, candidates, position, total, override, why }. Every
 * verdict carries the state that produced it, so the wrapper's message can say
 * which rule applied and the preflight (point 707) can report it without
 * re-deciding anything.
 *
 * EVERY "cannot judge" ANSWERS ALLOWED, by decision rather than by luck: a call
 * that names no point, a work order that reads as empty, a point the work order
 * does not carry (a cross-cutting branch, a hotfix) and a front that offers no
 * candidate at all are all states in which a refusal would name no alternative.
 * A guard that blocks while it cannot say what to do instead is a trap.
 */
export function commissionDecision({
  point = null,
  open = [],
  gates = null,
  inFlight = [],
  cap = POOL_CAP,
  override = '',
} = {}) {
  const g = normaliseGates(gates)
  const n = Number(point)
  const reason = String(override ?? '').trim()
  const known = Number.isInteger(n) && n > 0
  const order = queueOrder(open, g)
  const idx = known ? order.indexOf(n) : -1
  const candidates = frontCandidates({ open, gates: g, inFlight, count: cap })
  const busy = new Set((Array.isArray(inFlight) ? inFlight : []).map(Number))
  const out = {
    point: known ? n : null,
    candidates,
    position: idx >= 0 ? idx + 1 : null,
    total: order.length,
    override: reason || null,
  }
  const ok = (why) => ({ ...out, allowed: true, why })
  if (!known) return ok('no-point')
  if (order.length === 0) return ok('no-work-order')
  if (idx < 0) return ok('not-in-work-order')
  // Work already under way is not being OPENED. The refusal fires at the moment
  // a point is picked up; a session pushing to the branch it already holds, or
  // re-cutting one that exists, is finishing, not starting.
  if (busy.has(n)) return ok('already-in-flight')
  // A point waiting on the user cannot be worked at all, and that is a different
  // sentence from "it is behind others" — reporting the second for the first is
  // how a gate reads as a queue-order quibble.
  if (g.gated.has(n)) return { ...out, allowed: false, why: 'user-gated' }
  if (candidates.includes(n)) return ok('at-front')
  if (candidates.length === 0) return ok('no-candidates')
  if (reason) return ok('override')
  return { ...out, allowed: false, why: 'behind-front' }
}

/**
 * The refusal's wording. PURE, so it is pinned by a test rather than left to a
 * script: the point requires it to NAME the candidates it expected and the
 * refused point's own position, and to say how an override is taken.
 */
export function commissionRefusal(decision = {}) {
  const n = decision?.point ?? '?'
  const names = (Array.isArray(decision?.candidates) ? decision.candidates : []).join(', ')
  const front = names ? `the front of the queue holds ${names}` : 'the queue offers no workable candidate'
  const total = decision?.total ?? 0
  const where =
    decision?.position != null
      ? `the work order ranks it ${decision.position} of ${total} open points`
      : 'the work order does not rank it'
  const remedy =
    `Work one of those instead, or RECORD why ${n} goes first: ${COMMISSION_OVERRIDE_CMD}. ` +
    `The reason is stored with the point and printed by \`${COMMISSION_STATUS_CMD}\`, so an override stays ` +
    'visible afterwards — overriding is allowed, taking it silently is not.'
  if (decision?.why === 'user-gated') {
    return (
      `POINT ${n} IS WAITING ON THE USER (AWAITING-USER in the work order), so no work may be opened on it: ` +
      `${front}. ${remedy}`
    )
  }
  return `COMMISSIONING POINT ${n} ANSWERS TO NOTHING: ${where}, while ${front}. ${remedy}`
}
