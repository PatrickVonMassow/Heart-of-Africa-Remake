// Pure decision logic of the queue-order Stop-hook guard (queue-order-guard.mjs
// is the thin fail-open I/O wrapper). Kept side-effect-free so the Vitest layer
// can sweep every rule without fs/git (scripts/queue-order-guard-core.test.mjs).
//
// Two invariants the assistant repeatedly got wrong, now ENFORCED at turn end:
//   (1) QUEUE ORDER — known-bug FIXES and user-requested extensions are worked
//       BEFORE the big bug-FINDING / QA-framework tickets (memory
//       queue-order-fixes-before-finders). A finder card queued ahead of open
//       fix work blocks the turn.
//   (2) DASHBOARD TRUTH — a queue/now card must not CLAIM its point is done
//       ("behoben", "erledigt", …) while that point is still open ([ ]) in
//       TASKS.md. A conservative negation/qualifier window keeps honest
//       retractions ("NICHT gelöst", "die 'behoben'-Behauptung war FALSCH") and
//       sub-work notes ("Diagnose-Vorarbeit erledigt", "(b) erledigt") from
//       tripping it — better a missed claim than a false block.
// Fail-open is the WRAPPER's job; this core must never throw on partial input.

/** The bug-FINDING / QA-framework point numbers; every other open point is a fix. */
// The big bug-FINDING / QA-framework block (worked after the known-bug fixes).
// 181 is a concrete WebGPU BUG (a fix), not a finder — it is intentionally NOT
// here, so it may sit among the fixes ahead of the finder/closing block.
export const FINDER_POINTS = new Set([184, 203, 204, 205, 207])

/** The release tag is always last and exempt from the order rule. */
export const RELEASE_TAG_POINT = 174

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
export function finderBeforeOpenFix(queueOrder, tasksOpenSet) {
  if (!Array.isArray(queueOrder)) return []
  const open = tasksOpenSet instanceof Set ? tasksOpenSet : new Set()
  const isOpenFix = (v) => {
    const n = Number(v)
    return open.has(n) && !FINDER_POINTS.has(n) && n !== RELEASE_TAG_POINT
  }
  const offenders = []
  for (let i = 0; i < queueOrder.length; i++) {
    const n = Number(queueOrder[i])
    if (!FINDER_POINTS.has(n) || !open.has(n) || offenders.includes(n)) continue
    if (queueOrder.slice(i + 1).some(isOpenFix)) offenders.push(n)
  }
  return offenders
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

    const misordered = finderBeforeOpenFix(cards.map((c) => c.point), open)
    if (misordered.length) {
      problems.push(
        `QUEUE ORDER WRONG: finder/QA point(s) ${misordered.join(', ')} are queued AHEAD of open fix ` +
          `work. Known-bug fixes and user-requested extensions come BEFORE the finder/QA tickets ` +
          `(${[...FINDER_POINTS].join(', ')}); ${RELEASE_TAG_POINT} stays last. Reorder the ` +
          'Warteschlange cards, republish (dashboard-publish.mjs + Artifact), re-run --synced.',
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
          'tick the point in TASKS.md. Then republish (dashboard-publish.mjs + Artifact) and re-run --synced.',
      )
    }

    return problems.length ? { block: true, reason: problems.join(' | ') } : { block: false, reason: '' }
  } catch {
    return { block: false, reason: '' } // total by contract — the wrapper's fail-open must never depend on luck
  }
}
