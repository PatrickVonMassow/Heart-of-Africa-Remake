// Pure half of the done-card backfill (point 1535, user 17.11.2026): every
// Erledigt card on the board and on its archive page trades the heading
// "Stand der Umsetzung" and its status for "Umgesetzte Maßnahmen" and a
// measures text. The texts come from `done-measures.json`, written by one
// author from each point's merged `feat/<N>-*` branch on main; a card whose
// work cannot be attributed unambiguously gets MEASURES_UNKNOWN_TEXT instead
// of a guess. One-off; the CLI is `board-done-backfill.mjs`.
import {
  MEASURES_SECTION_TITLE,
  MEASURES_UNKNOWN_TEXT,
  archiveSpans,
  doneBounds,
  normaliseLineEndings,
  renderCardSections,
  renderStatusSection,
} from './board-core.mjs'
import { pointOwnershipFromTitle } from './dashboard-point-reader-core.mjs'

const CARD_RE = /<details>\s*<summary>[\s\S]*?<\/details>/g
const BODY_RE = /(<div class="body">)([\s\S]*?)(\s*<\/div>\s*<\/details>)$/

/** The point a done card names: its number chip, else a legacy "651 — …" title; null when neither. */
export function cardPoint(card) {
  const chip = String(card).match(/<span class="num">(\d+)<\/span>/)
  if (chip) return Number(chip[1])
  const title = (String(card).match(/<span class="t">([^<]*)<\/span>/) ?? [])[1]
  const points = title == null ? [] : pointOwnershipFromTitle(title, { allowUnseparatedSingle: true }).points
  return points.length === 1 ? Number(points[0]) : null
}

/** Whether a card already shows the measures heading — the backfill is idempotent. */
export function hasMeasures(card) {
  return String(card).includes(`<p class="status-head">${MEASURES_SECTION_TITLE}</p>`)
}

/** One card rewritten: description kept byte for byte, status replaced by the measures section. */
export function backfillCard(card, measures, { checked = '' } = {}) {
  const m = String(card).match(BODY_RE)
  if (!m) return card
  const [, open, inner, close] = m
  const at = inner.indexOf('<hr class="split">')
  const body =
    at >= 0
      ? `${inner.slice(0, at).replace(/\s*$/, '')}\n${renderStatusSection({ status: measures, title: MEASURES_SECTION_TITLE, checked })}`
      : `\n${renderCardSections({ description: '', status: measures, title: MEASURES_SECTION_TITLE, checked })}`
  return card.slice(0, m.index) + open + body + close
}

/**
 * Rewrite every done card inside [from, end) of `html`. `measuresFor(point)`
 * returns the text or null; null (or a card without a point) takes the
 * not-attributable text. Returns { html, cards: [{ point, outcome }] }.
 */
function backfillRegion(html, from, end, measuresFor) {
  const region = html.slice(from, end)
  const cards = []
  const out = region.replace(CARD_RE, (card) => {
    const point = cardPoint(card)
    if (hasMeasures(card)) {
      cards.push({ point, outcome: 'kept' })
      return card
    }
    const text = point == null ? null : measuresFor(point)
    const measures = String(text ?? '').trim() || MEASURES_UNKNOWN_TEXT
    cards.push({ point, outcome: measures === MEASURES_UNKNOWN_TEXT ? 'unknown' : 'written' })
    // No check note: old free-text statuses cannot prove a picture check (point 1535 review).
    return backfillCard(card, measures)
  })
  return { html: html.slice(0, from) + out + html.slice(end), cards }
}

/** The board's Erledigt section backfilled. A board without the section comes back unchanged. */
export function backfillBoard(boardHtml, measuresFor) {
  const html = normaliseLineEndings(String(boardHtml ?? ''))
  const b = doneBounds(html)
  if (!b) return { html, cards: [] }
  return backfillRegion(html, b.from, b.end, measuresFor)
}

/** The archive page's done cards backfilled (the region under the FIRST `<h2>`, before the decision log). */
export function backfillArchive(archiveHtml, measuresFor) {
  const html = normaliseLineEndings(String(archiveHtml ?? ''))
  if (html.indexOf('<h2>') < 0) return { html, cards: [] }
  const { done } = archiveSpans(html)
  // No decision-log section yet: the done region runs to `</main>` (or the end).
  const main = html.indexOf('</main>', done.at)
  const end = done.end > done.at ? done.end : main >= 0 ? main : html.length
  return backfillRegion(html, done.at, end, measuresFor)
}

/**
 * The point a merge commit subject on main lands, or null: exactly
 * `Merge branch 'feat/<N>-…'` (or its remote-tracking form), never a sync of
 * main INTO a feature branch.
 */
export function mergedPoint(subject) {
  const m = String(subject ?? '').match(/^Merge (?:remote-tracking )?branch '(?:origin\/)?feat\/(\d+)-[^']*'$/)
  return m ? Number(m[1]) : null
}

/**
 * Points whose work is attributable: exactly ONE branch name merged for the
 * point. Two different `feat/<N>-*` branches make it ambiguous.
 */
export function attributablePoints(mergeSubjects = []) {
  const branches = new Map()
  for (const s of mergeSubjects) {
    const point = mergedPoint(s)
    if (point == null) continue
    const name = s.match(/feat\/[^']+/)[0]
    if (!branches.has(point)) branches.set(point, new Set())
    branches.get(point).add(name)
  }
  return new Set([...branches].filter(([, names]) => names.size === 1).map(([p]) => p))
}

/** The lookup the transform uses: an authored text only for an attributable point. */
export function measuresLookup(texts = {}, attributable = new Set()) {
  return (point) => (attributable.has(Number(point)) ? (texts[String(point)] ?? null) : null)
}
