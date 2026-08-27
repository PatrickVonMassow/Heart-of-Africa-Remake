import { SETTLED_OWNER_RULINGS } from './settled-owner-rulings.mjs'

export const NOT_SETTLED_PREFIX = 'Not settled ruling'

/** Canonical words for phrase matching, including German ASCII transliteration. */
export function normalizeRulingText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const containsTerm = (text, term) => {
  const candidate = ` ${normalizeRulingText(text)} `
  const needle = normalizeRulingText(term)
  return Boolean(needle) && candidate.includes(` ${needle} `)
}

/**
 * Return the registered ruling a question is certainly or possibly revisiting.
 *
 * Every term group must match for a certain hit. An anchor-group hit on its own
 * is uncertain: it is loud, but has the explicit one-line distinction below.
 * A generic action such as "increase" can therefore never flag an unrelated
 * question by itself.
 */
export function matchSettledRuling(text, rulings = SETTLED_OWNER_RULINGS) {
  if (typeof text !== 'string' || !text.trim() || !Array.isArray(rulings)) return null
  // The distinction explains why a possible hit is different; its explanation
  // must not itself upgrade that hit ("not permission to raise it" contains an
  // action term). Match the question, never the escape record.
  const questionText = text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().toLowerCase().startsWith(`${NOT_SETTLED_PREFIX.toLowerCase()} `))
    .join('\n')
  let uncertain = null
  for (const ruling of rulings) {
    const groups = Array.isArray(ruling?.terms) ? ruling.terms : []
    const matchedGroups = groups.filter(
      (group) => Array.isArray(group?.anyOf) && group.anyOf.some((term) => containsTerm(questionText, term)),
    )
    if (groups.length > 0 && matchedGroups.length === groups.length) {
      return { kind: 'certain', ruling, matchedGroups: matchedGroups.map((group) => group.name) }
    }
    if (!uncertain && matchedGroups.some((group) => group.anchor === true)) {
      uncertain = { kind: 'uncertain', ruling, matchedGroups: matchedGroups.map((group) => group.name) }
    }
  }
  // A possible hit earlier in the register must never hide a certain hit later.
  // Order is editorial, not a precedence rule.
  return uncertain
}

/** The only uncertain-match escape, deliberately visible in the card/reply. */
export function statedDistinction(text, rulingId) {
  if (typeof text !== 'string' || typeof rulingId !== 'string') return null
  const escaped = rulingId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const line = new RegExp(`^${NOT_SETTLED_PREFIX}\\s+${escaped}:\\s*(\\S[^\\r\\n]*)$`, 'im').exec(text)
  return line?.[1]?.trim() || null
}

export function settledRulingVerdict(text, rulings = SETTLED_OWNER_RULINGS) {
  const match = matchSettledRuling(text, rulings)
  if (!match) return { block: false, reason: null, match: null }
  if (match.kind === 'uncertain') {
    const distinction = statedDistinction(text, match.ruling.id)
    if (distinction) return { block: false, reason: null, match, distinction }
  }

  const { ruling } = match
  const certainty = match.kind === 'certain'
    ? 'This question re-asks a settled owner ruling.'
    : 'This question may re-ask a settled owner ruling.'
  const escape = match.kind === 'uncertain'
    ? `\nIf it is a different question, state why in one line and retry:\n${NOT_SETTLED_PREFIX} ${ruling.id}: <why this question is different>`
    : ''
  return {
    block: true,
    match,
    reason:
      `Settled owner ruling "${ruling.id}" (${ruling.date}): ${certainty}\n` +
      `Ruling: ${ruling.ruling}\n` +
      `Owner's words: "${ruling.ownerWords}"\n` +
      `Already authorised action: ${ruling.authorisedAction}${escape}`,
  }
}
