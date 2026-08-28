// WHAT MAY STAND UNDER "VON DIR ZU KLÄREN". PURE.
//
// A card parks work just as surely as an AWAITING-CONFIRMATION marker does. Its
// authority is therefore typed in the same direction as the point gate: an open
// question selects one CLOSED user-owned category instead of asking prose to
// sound important enough. Everything else is decided by the owner and recorded
// in the already-established Entscheidungsprotokoll shape, so work continues
// and the user's only remaining action is the exact veto named by the card.

import { addressesUser, asksForDecision } from './decision-card-guard-core.mjs'

/** The only subjects an open decision card may leave to the user. */
export const USER_OWNED_CATEGORIES = Object.freeze({
  'design-content': 'content of design.md',
  'release-tag': 'releases and tags',
  'scope-extension': 'an extension of the commissioned scope',
  'money-permission': 'money or permissions',
  'user-data-deletion': 'deletion of user data',
})

const CATEGORY_LABEL = 'User-owned category'
const CATEGORY_RE = new RegExp(
  `(?:^|\\n)\\s*${CATEGORY_LABEL}:\\s*(${Object.keys(USER_OWNED_CATEGORIES).join('|')})\\s*\\.(?:\\s|$)`,
  'i',
)

/** A selected category key, or ''. Descriptions and unknown keys grant no authority. */
export function userOwnedCategory(text) {
  return String(text ?? '').match(CATEGORY_RE)?.[1]?.toLowerCase() ?? ''
}

/**
 * Two alternatives, spelled out. A card must still tell the user what decision
 * the selected category leaves to them; the category is authority, not content.
 */
export function namesOptions(text) {
  const prose = String(text ?? '')
  if (!prose.trim()) return false
  if (/\b(optionen|varianten|möglichkeiten|auswahl)\s*:/i.test(prose)) return true
  if (/\bentweder\b[\s\S]{0,400}\boder\b/i.test(prose)) return true
  const bullets = prose.match(/^\s*(?:[([]?[a-d][)\].]|[1-4][).]|[-*•])\s+\S/gim) ?? []
  if (bullets.length >= 2) return true
  return /\boder\b[^.!?]*\?/i.test(prose)
}

/**
 * Point 864's self-decided record, recognised structurally. Requiring the title
 * and all four labels prevents an ordinary open question from borrowing one
 * decision-sounding sentence. The fixed possibilities sentence says that the
 * decision is already in force: leaving it needs no user act; reversal names
 * the one exact veto action.
 */
export function isAdvisoryDecisionRecord({ title, body } = {}) {
  const head = String(title ?? '').trim()
  const text = String(body ?? '').trim()
  return (
    /^Entscheidungsprotokoll:/i.test(head) &&
    /(?:^|[.!?]\s+)Entscheidung:\s*\S/i.test(text) &&
    /(?:^|[.!?]\s+)Evidenz:\s*\S/i.test(text) &&
    /(?:^|[.!?]\s+)Folge:\s*\S/i.test(text) &&
    /Deine Möglichkeiten:\s*die Entscheidung stehen lassen,\s*oder sie zurücknehmen\s*[—-]\s*exakte Veto-Aktion:\s*\S/i.test(text)
  )
}

const openQuestionPattern = () =>
  `begin the body with "${CATEGORY_LABEL}: <key>." where <key> is one of: ` +
  Object.keys(USER_OWNED_CATEGORIES).join(', ')

const decisionRecordPattern =
  'For an owner-decidable question, act first and write an "Entscheidungsprotokoll:" card with ' +
  '"Entscheidung:", "Evidenz:", "Folge:" and "Deine Möglichkeiten: die Entscheidung stehen lassen, ' +
  'oder sie zurücknehmen — exakte Veto-Aktion:"; the veto is the user’s only action.'

/**
 * Is this card admissible? The historical export name is retained because the
 * automated callers import it, but the verdict deliberately applies to every
 * vdzk-add path now; a direct CLI call is not a less accountable caller.
 */
export function judgeAutomatedCard({ title, body } = {}) {
  const head = String(title ?? '').trim()
  const text = String(body ?? '').trim()
  if (!head || !text) {
    return { ok: false, reason: 'board: a decision card needs both a title and a body' }
  }
  if (isAdvisoryDecisionRecord({ title: head, body: text })) return { ok: true, reason: null }

  const category = userOwnedCategory(text)
  const options = namesOptions(text)
  const addressed = asksForDecision(text).asks || text.split(/(?<=[.!?])\s+|\n+/).some((sentence) => addressesUser(sentence))
  if (category && options && addressed) return { ok: true, reason: null }

  const defect = !category
    ? `the card does not select a user-owned category; ${openQuestionPattern()}`
    : !options
      ? `category "${category}" is named, but the card does not name the options`
      : `category "${category}" and its options are named, but the card never addresses the user`
  return {
    ok: false,
    reason:
      `board: REFUSED — "${head}" is not an admissible user decision: ${defect}. ` +
      `${decisionRecordPattern} Batch state belongs in the derived "Woran ich gerade arbeite" card.`,
  }
}
