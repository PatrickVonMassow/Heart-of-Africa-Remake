// Pure decision logic of the dashboard-conciseness Stop-hook guard
// (dashboard-conciseness-guard.mjs is the thin fail-open I/O wrapper). Kept
// side-effect-free so the Vitest layer can sweep every rule without fs
// (scripts/dashboard-conciseness-guard-core.test.mjs).
//
// WHY (user mandate, third regression 23.07.2026): the dashboard cards must
// read HIGH-LEVEL and SHORT — what is happening and why it matters, glanceable
// on a phone. They kept regressing into changelog walls: commit hashes, file
// paths, code spans, step-by-step merge plans. Reminders failed twice, so this
// enforces it MECHANICALLY at turn end, like the sibling dashboard guards.
//
// Enforced rules, on the now-cards ("Woran ich gerade arbeite") and the open
// queue cards ("Warteschlange") only — "Von dir zu klären" and "Erledigt" are
// exempt (questions are the user's text; history may be detailed):
//   (1) VERBOSITY  — body over WORD_BUDGET words is too long for a glance.
//   (2) TECH DENSITY — more than TECH_TOKEN_BUDGET technical tokens (<code>
//       spans, commit SHAs, file paths, §-refs) reads as a changelog, not a
//       status. Git history and TASKS.md carry that detail; the card must not.
//   (3) PARAGRAPH STRUCTURE — a body over SINGLE_PARAGRAPH_WORD_BUDGET words
//       squeezed into ONE <p> blob is unreadable; longer cards split into
//       short paragraphs. One-liner cards may stay a single <p>.
//
// Budgets calibrated against the live board of 23.07.2026: the good,
// glanceable cards measured <= 82 words, <= 4 tech tokens, and were short or
// multi-paragraph; the bloated ones sat at >= 91 words, 5-24 tech tokens,
// 72+-word single-<p> blobs. The thresholds sit in the empirical gap.
// Fail-open is the WRAPPER's job; this core must never throw on partial input.

/** Max body words for a now/queue card (good cards measured <= 82). */
export const WORD_BUDGET = 90

/** Max technical tokens (code spans + SHAs + file paths + §-refs); more reads as a changelog. */
export const TECH_TOKEN_BUDGET = 4

/** A body longer than this must be split into several <p> paragraphs. */
export const SINGLE_PARAGRAPH_WORD_BUDGET = 65

// Technical tokens in the stripped body text: repo paths, tooling/doc file
// names, commit SHAs (>= 7 hex chars), and §-references. The path-prefix
// alternative comes first so `docs/x.md` counts once, not twice.
const TECH_TOKEN_RE = /\b(?:src|scripts|docs)\/[\w./-]+|\b[\w-]+\.(?:mjs|cjs|ts|tsx|js|md)\b|\b[0-9a-f]{7,40}\b|§/g

const stripTags = (html) => html.replace(/<[^>]*>/g, ' ')

/** The section starting at `marker` up to the next <h2>, or '' when missing. */
function sectionSlice(html, marker) {
  const start = html.indexOf(marker)
  if (start < 0) return ''
  const end = html.indexOf('<h2>', start + 1)
  return html.slice(start, end < 0 ? undefined : end)
}

/**
 * The `<details>` cards of one section as [{where, point, title, bodyHtml}].
 * The point comes from `<span class="num">N</span>` (queue) or a leading
 * number in `<span class="t">` (now-cards); null for non-point work. Cards
 * without a body block are skipped (nothing to measure).
 */
export function parseCards(sectionHtml, where) {
  if (typeof sectionHtml !== 'string' || typeof where !== 'string') return []
  const cards = []
  for (const chunk of sectionHtml.split(/<details\b/).slice(1)) {
    const num = chunk.match(/class="num">\s*(\d+)/)
    const title = chunk.match(/class="t">\s*([^<]*)/)
    const titleNum = title && title[1].match(/^\s*(\d+)/)
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

/** Word count, <p> count and technical-token count of one card body. */
export function cardStats(bodyHtml) {
  if (typeof bodyHtml !== 'string') return { words: 0, paragraphs: 0, techTokens: 0 }
  const text = stripTags(bodyHtml)
  return {
    words: (text.match(/\S+/g) || []).length,
    paragraphs: (bodyHtml.match(/<p[\s>]/gi) || []).length,
    techTokens: (bodyHtml.match(/<code[\s>]/gi) || []).length + (text.match(TECH_TOKEN_RE) || []).length,
  }
}

/**
 * The offending now/queue cards as [{where: 'now'|'queue', point, reason}].
 * Total: malformed input yields no offenders.
 */
export function concisenessOffenders(html) {
  if (typeof html !== 'string') return []
  const cards = [
    ...parseCards(sectionSlice(html, 'Woran ich gerade arbeite'), 'now'),
    ...parseCards(sectionSlice(html, '<h2>Warteschlange'), 'queue'),
  ]
  const offenders = []
  for (const card of cards) {
    const { words, paragraphs, techTokens } = cardStats(card.bodyHtml)
    const reasons = []
    if (words > WORD_BUDGET) reasons.push(`${words} words (budget ${WORD_BUDGET}) — too verbose`)
    if (techTokens > TECH_TOKEN_BUDGET)
      reasons.push(
        `${techTokens} technical tokens (code spans/commit hashes/file paths/§-refs; budget ${TECH_TOKEN_BUDGET}) — reads like a changelog`,
      )
    if (words > SINGLE_PARAGRAPH_WORD_BUDGET && paragraphs <= 1)
      reasons.push(`one long unbroken paragraph (${words} words) — split into paragraphs`)
    if (reasons.length) offenders.push({ where: card.where, point: card.point, reason: reasons.join('; ') })
  }
  return offenders
}

/** Top-level decision on the raw dashboard HTML. Total: any bad input → allow. */
export function evaluate({ dashboardHtml } = {}) {
  try {
    const offenders = concisenessOffenders(dashboardHtml)
    if (offenders.length === 0) return { block: false, reason: '' }
    const list = offenders
      .map((o) => `${o.where} card ${o.point ?? '(no point)'}: ${o.reason}`)
      .join(' | ')
    return {
      block: true,
      reason:
        `DASHBOARD CARDS NOT CONCISE/HIGH-LEVEL: ${list}. Rewrite each flagged card SHORT and ` +
        'HIGH-LEVEL — what is happening and why it matters, phone-glanceable. Drop commit hashes, ' +
        'file paths, code spans and step-by-step technical detail (git history and TASKS.md carry ' +
        'those), and split a longer body into short <p> paragraphs. Erledigt/Von-dir-zu-klären ' +
        'cards are exempt. Then republish (dashboard-publish.mjs + Artifact) and re-run ' +
        'dashboard-guard --synced.',
    }
  } catch {
    return { block: false, reason: '' } // total by contract — the wrapper's fail-open must never depend on luck
  }
}
