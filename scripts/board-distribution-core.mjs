// THE "VERTEILUNG" LINE OF EVERY WORK CARD — pure core.
//
// WHY. A card said what a point delivers and how far it got, but not who built
// it, who reviewed it, or whether the build ran locally or in the cloud
// (user request 24.10.2026). Those facts already sit in the records: the commit
// trailers name the authoring model, a `Claude-Session` trailer marks a commit
// made in a cloud session, and the review ledger names the cross-vendor reviewer.
//
// THE LINE IS DERIVED, NEVER TYPED. Like the criticality badge it is a
// whole-document render pass on the publish path, so a hand edit or an older
// card is repaired on the next publish rather than drifting.
//
// PURE: scripts/board-distribution.mjs gathers commits and ledger rows; every
// judgement and every word is made here so the unit layer can sweep it.

import { resolveModel } from './model-lanes.mjs'
import { summaryPoint, unwrapCardHeaderGroups } from './board-core.mjs'

export const DISTRIBUTION_TITLE = 'Verteilung'
export const DISTRIBUTION_PENDING = 'offen'
export const VENUE_LABELS = Object.freeze({ local: 'Lokal', cloud: 'Cloud' })

const HEAD_CLASS = 'dist-head'
const LINE_CLASS = 'dist'
/** The section this pass owns, wherever an earlier render left it in a body. */
const SECTION_RE = new RegExp(
  `\\s*<p class="${HEAD_CLASS}">[\\s\\S]*?</p>(?:\\s*<p class="${LINE_CLASS}">[\\s\\S]*?</p>)?`,
  'g',
)
const CARD_RE = /<details(?: class="now"[^>]*)?>\s*<summary>[\s\S]*?<\/details>/g

const escapeHtml = (text) =>
  String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * A model as the card names it: the registered display name of a current
 * spelling, a retired spelling as recorded (it names the model that actually
 * ran), anything unregistered with address, context suffix and vendor prefix
 * stripped. '' when nothing is left.
 */
export function modelLabel(value) {
  const hit = resolveModel(value)
  if (hit) {
    if (hit.fallback) return hit.lane.fallback.displayName
    return hit.lane.retired.includes(hit.matched) ? hit.matched : hit.lane.displayName
  }
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\(\s*1m\s+context\s*\)|\[1m\]/gi, ' ')
    .replace(/^\s*Claude\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The point a `feat/<N>-<slug>` ref or a "Merge branch 'feat/<N>-…'" subject names, or null. */
export function pointOfBranch(text) {
  const m = String(text ?? '').match(/(?:^|[/'\s])feat\/(\d+)-/)
  return m ? Number(m[1]) : null
}

/**
 * Who built and who reviewed `point`.
 *
 * `commits` are the point's authored commits as `{ authors: [trailer], cloud }`;
 * `records` the review ledger rows. The build falls back to a review row's
 * `authoredBy` (without a venue) only when no commit of the point is known.
 * Returns `{ build: [{ model, venues }], review: [model] }`, empty for pending.
 */
export function distributionOf(point, { commits = [], records = [] } = {}) {
  const n = Number(point)
  const reviews = (records ?? []).filter(
    (r) => r && !r.kind && Number(r.point) === n && r.verdict && r.model,
  )
  const build = new Map()
  const add = (model, venue) => {
    if (!model) return
    if (!build.has(model)) build.set(model, new Set())
    if (venue) build.get(model).add(venue)
  }
  for (const commit of commits ?? []) {
    for (const author of commit?.authors ?? []) add(modelLabel(author), commit.cloud ? 'cloud' : 'local')
  }
  if (!build.size) for (const r of reviews) add(modelLabel(r.authoredBy), null)
  const venueOrder = Object.keys(VENUE_LABELS)
  return {
    build: [...build].map(([model, venues]) => ({
      model,
      venues: venueOrder.filter((v) => venues.has(v)),
    })),
    // A reviewer claim the transcript contradicts names the model that actually answered.
    review: [
      ...new Set(
        reviews
          .map((r) =>
            modelLabel(
              r.reviewerAuthorship?.status === 'disagreement' && r.reviewerAuthorship.actualModel
                ? r.reviewerAuthorship.actualModel
                : r.model,
            ),
          )
          .filter(Boolean),
      ),
    ],
  }
}

/** The fixed-form line: "Bau: <model> · <venue> | Prüfung: <model>", "offen" for a pending part. */
export function distributionLine({ build = [], review = [] } = {}) {
  const built = build.length
    ? build
        .map(({ model, venues }) =>
          venues.length ? `${model} · ${venues.map((v) => VENUE_LABELS[v]).join('/')}` : model,
        )
        .join(', ')
    : DISTRIBUTION_PENDING
  const reviewed = review.length ? review.join(', ') : DISTRIBUTION_PENDING
  return `Bau: ${built} | Prüfung: ${reviewed}`
}

/** The two paragraphs the pass writes at the end of a card body. */
export function renderDistributionSection(line, indent = '    ') {
  return (
    `${indent}<p class="${HEAD_CLASS}">${DISTRIBUTION_TITLE}</p>\n` +
    `${indent}<p class="${LINE_CLASS}">${escapeHtml(line)}</p>`
  )
}

/**
 * Give every numbered card's body its derived "Verteilung" section, replacing
 * the one an earlier render left. `lineFor(point)` returns the line, or null
 * to leave that card without one. Cards without a numeric chip or a body are
 * returned verbatim.
 */
export function renderCardDistributions(html, lineFor) {
  return String(html ?? '').replace(CARD_RE, (card) => {
    const summary = (card.match(/<summary>([\s\S]*?)<\/summary>/) ?? [])[1] ?? ''
    const { chip } = summaryPoint(unwrapCardHeaderGroups(summary))
    if (chip == null) return card
    const body = card.match(/(<div class="body">)([\s\S]*?)(\s*<\/div>\s*<\/details>)$/)
    if (!body) return card
    const line = lineFor(Number(chip))
    const inner = body[2].replace(SECTION_RE, '')
    const section = line == null ? '' : `\n${renderDistributionSection(line)}`
    return card.slice(0, body.index) + body[1] + inner + section + body[3]
  })
}
