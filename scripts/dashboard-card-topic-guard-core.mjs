// Pure decision logic of the dashboard-card-topic Stop-hook guard
// (dashboard-card-topic-guard.mjs is the thin fail-open I/O wrapper). Kept
// side-effect-free so the Vitest layer can sweep every rule without fs
// (scripts/dashboard-card-topic-guard-core.test.mjs).
//
// WHY (user mandate 23.07.2026): each dashboard card must speak STRICTLY about
// its OWN topic (its own TASKS point). The concrete regression: the active
// "272" now-card reported "Der Krokodil-Fix (246) und der Geräusch-Fix (266)
// sind geprüft und gelandet …" — status of OTHER points inside the 272 card.
// This enforces topic purity MECHANICALLY at turn end, like the sibling guards.
//
// Enforced rule, on the now-cards ("Woran ich gerade arbeite"), the questions
// ("Von dir zu klären") and the open queue ("Warteschlange") — "Erledigt" is
// exempt (history cards legitimately narrate cross-point context, the same
// precedent as the conciseness guard's exemption): the card body must not
// reference a TASKS point other than the card's own. A reference counts ONLY
// in these explicit, predictable forms (case-insensitive):
//   (a) "Punkt N" / "point N"        — the spelled-out form;
//   (b) "(N)" with N a 2-3 digit number — the bare parenthesized form that
//       carried the 272 regression ("(246)", "(266)"). Single-digit "(1)" is
//       NEVER a point reference: it is the enumeration/inventory convention
//       ("(1) Schrift-Norden … (4) Signal-Osten" on the live board), while
//       every realistic cross-reference on the board is >= 2 digits.
// Either form flags iff the number is a KNOWN TASKS point number (the caller
// passes the set parsed from TASKS.md) AND differs from the card's own number.
// A card without an own number (typical for "Von dir zu klären") owns nothing,
// so ANY known-point reference in it is a cross-reference — a question card
// states a decision, it does not report on a point. Everything else — counts
// ("15 neue Tests"), dates ("31.12.1895"), times ("14:54"), years ("1890"),
// versions ("v0.2"), §-refs ("§19.8"), slashed screenshot pairs ("129/130"),
// bare numbers and commit hashes — stays untouched by construction: no extra
// exemption list, the two match forms are simply that tight.
// Fail-open is the WRAPPER's job; this core must never throw on partial input.

const stripTags = (html) => html.replace(/<[^>]*>/g, ' ')

/**
 * The set of known TASKS point numbers: every `- [ ] N.` / `- [x] N.` line.
 * Total: malformed input yields an empty set.
 */
export function knownPoints(tasksText) {
  const points = new Set()
  if (typeof tasksText !== 'string') return points
  for (const line of tasksText.split('\n')) {
    const m = line.match(/^- \[[ x]\] (\d+)\./)
    if (m) points.add(Number(m[1]))
  }
  return points
}

/** The section starting at `marker` up to the next <h2>, or '' when missing. */
function sectionSlice(html, marker) {
  const start = html.indexOf(marker)
  if (start < 0) return ''
  const end = html.indexOf('<h2>', start + 1)
  return html.slice(start, end < 0 ? undefined : end)
}

/**
 * The `<details>` cards of one section as [{where, point, title, bodyHtml}].
 * The own point comes from `<span class="num">N</span>` (queue) or a now-card
 * title starting `NNN — …` / `NNN - …`; null for cards without one (VDZK,
 * process cards). Cards without a body block are skipped (nothing to scan).
 */
export function parseCards(sectionHtml, where) {
  if (typeof sectionHtml !== 'string' || typeof where !== 'string') return []
  const cards = []
  for (const chunk of sectionHtml.split(/<details\b/).slice(1)) {
    const num = chunk.match(/class="num">\s*(\d+)/)
    const title = chunk.match(/class="t">\s*([^<]*)/)
    const titleNum = title && title[1].match(/^\s*(\d{2,3})\s*[—-]/)
    const body =
      chunk.match(/<div class="body">([\s\S]*?)<\/div>\s*<\/details>/) ||
      chunk.match(/<div class="body">([\s\S]*)$/)
    if (!body) continue
    cards.push({
      where,
      point: num ? Number(num[1]) : titleNum ? Number(titleNum[1]) : null,
      title: title ? title[1].trim() : '',
      bodyHtml: body[1],
    })
  }
  return cards
}

// The two — and only two — reference forms (see the header comment): the
// spelled-out "Punkt/point N" and the parenthesized 2-3 digit "(NN)"/"(NNN)".
const SPELLED_REF_RE = /\b(?:punkt|point)\s+(\d{1,3})\b/gi
const PAREN_REF_RE = /\((\d{2,3})\)/g

/**
 * The foreign-point numbers referenced in one card body, deduplicated and in
 * order of first appearance. `ownPoint` may be null (then every known-point
 * reference is foreign). Total: bad input yields [].
 */
export function foreignRefs(bodyHtml, ownPoint, known) {
  if (typeof bodyHtml !== 'string' || !(known instanceof Set)) return []
  const text = stripTags(bodyHtml)
  const refs = []
  for (const re of [SPELLED_REF_RE, PAREN_REF_RE]) {
    for (const m of text.matchAll(re)) {
      const n = Number(m[1])
      if (known.has(n) && n !== ownPoint && !refs.includes(n)) refs.push(n)
    }
  }
  return refs.sort((a, b) => a - b)
}

/**
 * The off-topic cards as [{where, point, title, ref}] — one entry per foreign
 * point referenced. Total: malformed input yields no violations.
 */
export function topicViolations(html, known) {
  if (typeof html !== 'string' || !(known instanceof Set)) return []
  const cards = [
    ...parseCards(sectionSlice(html, 'Woran ich gerade arbeite'), 'now'),
    ...parseCards(sectionSlice(html, 'Von dir zu klären'), 'question'),
    ...parseCards(sectionSlice(html, '<h2>Warteschlange'), 'queue'),
  ]
  const violations = []
  for (const card of cards) {
    for (const ref of foreignRefs(card.bodyHtml, card.point, known)) {
      violations.push({ where: card.where, point: card.point, title: card.title, ref })
    }
  }
  return violations
}

/** Top-level decision on the raw dashboard + TASKS text. Total: any bad input → allow. */
export function evaluate({ dashboardHtml, tasksText } = {}) {
  try {
    const violations = topicViolations(dashboardHtml, knownPoints(tasksText))
    if (violations.length === 0) return { block: false, reason: '' }
    const list = violations
      .map((v) => `${v.where}-card "${v.point ?? v.title}" references point ${v.ref}`)
      .join(' | ')
    return {
      block: true,
      reason:
        `DASHBOARD CARD OFF ITS OWN TOPIC: ${list}. Each card must speak STRICTLY about its ` +
        'own point — never report on or describe another TASKS point (status of other points ' +
        'lives in THEIR cards; history belongs in Erledigt). Remove the cross-point passages ' +
        'from each flagged card, then republish (dashboard-publish.mjs + Artifact) and re-run ' +
        'dashboard-guard --synced.',
    }
  } catch {
    return { block: false, reason: '' } // total by contract — the wrapper's fail-open must never depend on luck
  }
}
