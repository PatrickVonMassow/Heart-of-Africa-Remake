// Pure decision logic of the queue-order Stop-hook guard (queue-order-guard.mjs
// is the thin fail-open I/O wrapper). Kept side-effect-free so the Vitest layer
// can sweep every rule without fs/git (scripts/queue-order-guard-core.test.mjs).
//
// Three invariants the assistant repeatedly got wrong, now ENFORCED at turn end:
//   (1) QUEUE ORDER — known-bug FIXES and user-requested extensions are worked
//       BEFORE the big bug-FINDING / QA-framework tickets (memory
//       queue-order-fixes-before-finders). A finder card queued ahead of open
//       fix work blocks the turn.
//   (1b) QUEUE AGREEMENT (point 608) — the sequence the board RENDERS is the one
//       the work order DERIVES. Rule (1) judges completeness of a ranking, not
//       agreement of two documents, so it stayed green through both re-sequencings
//       of 10.08.2026 while the published board kept showing the old plan. The
//       user found that before any check did.
//   (2) DASHBOARD TRUTH — a queue/now card must not CLAIM its point is done
//       ("behoben", "erledigt", …) while that point is still open ([ ]) in
//       TASKS.md. A conservative negation/qualifier window keeps honest
//       retractions ("NICHT gelöst", "die 'behoben'-Behauptung war FALSCH") and
//       sub-work notes ("Diagnose-Vorarbeit erledigt", "(b) erledigt") from
//       tripping it — better a missed claim than a false block.
// Fail-open is the WRAPPER's job; this core must never throw on partial input.
// The remedies' publish steps come from scripts/board-remedy.mjs — one copy.
import { REPUBLISH } from './board-remedy.mjs'
import { gatedPoints } from './user-gate-core.mjs'
import {
  FINDER_POINTS,
  QUEUE_REBUILD_CMD,
  RELEASE_TAG_POINT,
  openPointsOf,
  queueOrder,
} from './board-queue-core.mjs'

// The rank constants moved to board-queue-core with the ranking itself (point
// 608) — this guard is now a CONSUMER of that order, and owning them here would
// have closed an import cycle. Re-exported so every caller that named them here
// still finds them.
export { FINDER_POINTS, RELEASE_TAG_POINT }

/** Done-claim tokens (matched as whole words, case-insensitive). */
export const DONE_CLAIM_TOKENS = ['behoben', 'erledigt', 'gelöst', 'fertig', 'done', 'fixed', 'solved']

/**
 * Cues that mark a done-token as NOT a live claim about the card's own point:
 * negation/retraction, conditional/future phrasing, or a sub-work qualifier.
 * Substring-scanned (lowercase) in a ±60-char window around the token.
 */
export const NON_CLAIM_CUES = [
  // negation / retraction (German)
  'nicht', 'kein', 'falsch', 'unzureichend', 'offen', 'behauptung', 'angeblich', 'vermeintlich',
  // conditional / future (German)
  'wenn ', 'sobald', 'falls ', 'erst ', 'bis ', 'noch ', 'soll', 'muss', 'müssen',
  // sub-work qualifiers (German)
  'vorarbeit', 'diagnos', 'recherche', 'analyse', 'teilweise',
  // English equivalents
  'not ', "n't", 'never', 'wrong', 'insufficient', 'incorrect', 'partial', 'claim',
  'until', 'unless', 'still ', 'remains', 'once ', 'reopened', 'wieder auf',
]

const CLAIM_WINDOW = 60

/** Open TASKS point numbers as a Set; DEFERRED lines are skipped (same rule as dashboard-guard). */
export function parseOpenPoints(text) {
  const open = new Set()
  if (typeof text !== 'string') return open
  for (const l of text.split('\n')) {
    const m = l.match(/^- \[ \] (\d+)\./)
    if (m && !/\bDEFERRED\b/.test(l)) open.add(Number(m[1]))
  }
  return open
}

/**
 * The open points that can actually be WORKED — open minus the ones waiting on
 * the user (point 450).
 *
 * The order rule asks whether a finder was queued ahead of open FIX work, and a
 * point nobody may start is not work: with the gated cards demoted to the back
 * of the queue by construction, reading them as fixes would report every finder
 * as misordered and block the turn end for the whole of the user's absence —
 * the exact jam the gate exists to prevent, moved from the queue into the guard.
 */
export function parseWorkablePoints(text) {
  const gated = gatedPoints(text)
  return new Set([...parseOpenPoints(text)].filter((n) => !gated.has(n)))
}

const stripTags = (html) => html.replace(/<[^>]*>/g, ' ')

/**
 * Warteschlange cards in DOCUMENT ORDER: [{point, text}]. Anchored on the
 * section header (not any mention — the dashboard-guard lesson of 22.07.2026);
 * cards are `<details>` blocks with `<span class="num">N</span>`.
 */
export function parseQueueCards(html) {
  if (typeof html !== 'string') return []
  const qStart = html.indexOf('<h2>Warteschlange')
  if (qStart < 0) return []
  const qEnd = html.indexOf('<h2>', qStart + 1)
  const queueHtml = html.slice(qStart, qEnd < 0 ? undefined : qEnd)
  const cards = []
  for (const chunk of queueHtml.split(/<details\b/).slice(1)) {
    const m = chunk.match(/class="num">\s*(\d+)/)
    if (m) cards.push({ point: Number(m[1]), text: stripTags(chunk) })
  }
  return cards
}

/**
 * The now-card as {point, text} (point null when its title has no leading
 * number — non-point work), or null when the section is missing. The point is
 * the first `class="t">N` after the heading, never an incidental mention.
 */
export function parseNowCard(html) {
  if (typeof html !== 'string') return null
  const nowStart = html.indexOf('Woran ich gerade arbeite')
  if (nowStart < 0) return null
  const rest = html.slice(nowStart)
  const nextH2 = rest.indexOf('<h2>')
  const section = nextH2 < 0 ? rest : rest.slice(0, nextH2)
  const m = section.match(/class="t">\s*(\d+)/)
  return { point: m ? Number(m[1]) : null, text: stripTags(section) }
}

/**
 * Rule 1: finder points that sit AHEAD of open fix work in the queue order.
 * Only OPEN finders count (a done-but-queued card is dashboard staleness,
 * another guard's job), and only an OPEN non-finder point after them trips it;
 * the release tag (174) is exempt on both sides.
 */
export function finderBeforeOpenFix(cardOrder, tasksOpenSet) {
  if (!Array.isArray(cardOrder)) return []
  const open = tasksOpenSet instanceof Set ? tasksOpenSet : new Set()
  const isOpenFix = (v) => {
    const n = Number(v)
    return open.has(n) && !FINDER_POINTS.has(n) && n !== RELEASE_TAG_POINT
  }
  // The rule orders the work BEFORE the release only (user 26.07.2026: bugs,
  // then features, then the hardening tickets, then the tag). Cards queued
  // AFTER the release tag are post-release work and order themselves freely —
  // reading them as fixes that a finder had jumped ahead of would block the
  // turn for correctly deferred work.
  const tagAt = cardOrder.findIndex((v) => Number(v) === RELEASE_TAG_POINT)
  const cards = tagAt === -1 ? cardOrder : cardOrder.slice(0, tagAt + 1)
  const offenders = []
  for (let i = 0; i < cards.length; i++) {
    const n = Number(cards[i])
    if (!FINDER_POINTS.has(n) || !open.has(n) || offenders.includes(n)) continue
    if (cards.slice(i + 1).some(isOpenFix)) offenders.push(n)
  }
  return offenders
}

/**
 * Rule 1b: does the RENDERED sequence still agree with the DERIVED one?
 *
 * The comparison is over the points that appear in BOTH lists, because neither
 * is a superset of the other by design: the derived order holds every open
 * point, including those the now-section or "Von dir zu klären" has taken out of
 * the queue, and the board may still show a card for a point that was ticked
 * since (staleness, and another guard's business). Judging either difference
 * here would block on something this rule cannot state a remedy for.
 *
 * Returns null when they agree, else the FIRST divergence with both sequences.
 */
export function queueOrderDrift(renderedPoints, derivedOrder) {
  if (!Array.isArray(renderedPoints) || !Array.isArray(derivedOrder)) return null
  const derived = derivedOrder.map(Number).filter(Number.isInteger)
  const inDerived = new Set(derived)
  const got = renderedPoints.map(Number).filter((n) => inDerived.has(n))
  const rendered = new Set(got)
  const want = derived.filter((n) => rendered.has(n))
  if (want.length !== got.length) return null // a card listed twice — invariant 4b's case, not this one
  for (let i = 0; i < want.length; i++) {
    if (want[i] !== got[i]) return { at: i, got: got[i], want: want[i], rendered: got, derived: want }
  }
  return null
}

/**
 * The stretch of a sequence AROUND the divergence — never its head. A queue of
 * 140 cards that diverges at position 135 printed two identical opening runs,
 * which reads as a guard confused about its own finding.
 */
function window(list, at, span = 4) {
  const from = Math.max(0, at - span)
  const to = Math.min(list.length, at + span + 1)
  return `${from > 0 ? '…, ' : ''}${list.slice(from, to).join(', ')}${to < list.length ? ', …' : ''}`
}

/** A done-token occurrence that reads as a live claim (no negation/qualifier cue in its window). */
function hasLiveClaim(text) {
  const re = new RegExp(`\\b(${DONE_CLAIM_TOKENS.join('|')})\\b`, 'giu')
  for (const m of text.matchAll(re)) {
    const i = m.index
    const window = text.slice(Math.max(0, i - CLAIM_WINDOW), i + m[0].length + CLAIM_WINDOW).toLowerCase()
    if (NON_CLAIM_CUES.some((cue) => window.includes(cue))) continue
    // A sub-item label right before the token — "(b) erledigt" — claims a
    // sub-step, never the point itself.
    if (/\([a-z0-9]{1,3}\)[\s:.]*$/i.test(text.slice(Math.max(0, i - 14), i))) continue
    return true
  }
  return false
}

/**
 * Rule 2: points whose card text claims done while the point is still open in
 * TASKS. `cards` is [{point, text}]; cards without a leading point number are
 * skipped (nothing to hold the claim against).
 */
export function falseDoneClaims(cards, tasksOpenSet) {
  if (!Array.isArray(cards)) return []
  const open = tasksOpenSet instanceof Set ? tasksOpenSet : new Set()
  const offenders = []
  for (const card of cards) {
    if (!card || typeof card.text !== 'string') continue
    const n = Number(card.point)
    if (!Number.isInteger(n) || !open.has(n) || offenders.includes(n)) continue
    if (hasLiveClaim(card.text)) offenders.push(n)
  }
  return offenders
}

/** Top-level decision on the two raw file contents. Total: any bad input → allow. */
export function evaluate({ dashboardHtml, tasksMd } = {}) {
  try {
    const open = parseOpenPoints(tasksMd)
    if (open.size === 0) return { block: false, reason: '' }
    const cards = parseQueueCards(dashboardHtml)
    if (cards.length === 0) return { block: false, reason: '' }

    const problems = []

    // The ORDER rule judges workable points only (point 450); the DONE-CLAIM rule
    // below judges every open one — a card claiming a gated point is finished is
    // just as false as any other.
    const misordered = finderBeforeOpenFix(cards.map((c) => c.point), parseWorkablePoints(tasksMd))
    if (misordered.length) {
      problems.push(
        `QUEUE ORDER WRONG: finder/QA point(s) ${misordered.join(', ')} are queued AHEAD of open fix ` +
          `work. Known-bug fixes and user-requested extensions come BEFORE the finder/QA tickets ` +
          `(${[...FINDER_POINTS].join(', ')}); ${RELEASE_TAG_POINT} keeps its work-order position. Reorder the ` +
          `Warteschlange cards, then ${REPUBLISH}.`,
      )
    }

    // The AGREEMENT rule (point 608). It reads the same derivation the generator
    // renders from, so a board rebuilt from the current work order always passes
    // and only a hand-edited or unrebuilt one trips.
    const drift = queueOrderDrift(cards.map((c) => c.point), queueOrder(openPointsOf(tasksMd), tasksMd))
    if (drift) {
      problems.push(
        `QUEUE ORDER DRIFTED FROM THE WORK ORDER: the board shows point ${drift.got} at position ` +
          `${drift.at + 1} of the Warteschlange where the work order puts ${drift.want}. The queue's ` +
          `sequence is DERIVED from TASKS.md — the board renders it, it does not store it. ` +
          `Board there: ${window(drift.rendered, drift.at)} | work order there: ${window(drift.derived, drift.at)}. ` +
          `Rebuild the queue (${QUEUE_REBUILD_CMD}), then ${REPUBLISH}.`,
      )
    }

    const nowCard = parseNowCard(dashboardHtml)
    const claimCards = nowCard && nowCard.point != null ? [...cards, nowCard] : cards
    const claims = falseDoneClaims(claimCards, open)
    if (claims.length) {
      problems.push(
        `DASHBOARD CLAIMS DONE WHAT IS OPEN: the card(s) for point(s) ${claims.join(', ')} contain a ` +
          'done-claim ("behoben"/"erledigt"/"gelöst"/"done"/…) while the point is still open ([ ]) in ' +
          'TASKS.md. Either the claim is false — correct the card text — or the work truly is done — ' +
          `tick the point in TASKS.md. Then ${REPUBLISH}.`,
      )
    }

    return problems.length ? { block: true, reason: problems.join(' | ') } : { block: false, reason: '' }
  } catch {
    return { block: false, reason: '' } // total by contract — the wrapper's fail-open must never depend on luck
  }
}
