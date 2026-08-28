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
// THE TAG IS A HEADER AT COLUMN ZERO, and every gap inside it is HORIZONTAL
// (three cross-vendor rounds, GPT-5.6 Sol, 28.08.2026). Each loosening was the
// same defect wearing a different hat: a card that merely QUOTES the marker
// granted itself the authority it was quoting, and `withoutCategoryLine` then
// deleted the quoted text out of the rendered card — a question reaching the
// user with one of its own options missing. `(?:^|\n)` let the quotation sit
// anywhere; `^\s*` let it sit under a blank line or a Markdown indent; a
// trailing `\s` let the first line carry the marker and then keep talking.
// Column zero after one normalisation, horizontal gaps only, and a line break
// or the end of the body to close it — nothing else is the tag.
const CATEGORY_RE = new RegExp(
  `^${CATEGORY_LABEL}:[ \\t]*(${Object.keys(USER_OWNED_CATEGORIES).join('|')})[ \\t]*\\.[ \\t]*(?:\\r?\\n|$)`,
  'i',
)

/**
 * ONE reading of the card body for all three of judge, tag and stripper. They
 * disagreed while only the judge trimmed: a body behind a leading newline was
 * granted authority the stripper then refused to remove, so the English tag
 * reached the German card.
 *
 * The LEADING edge is deliberately left alone — trimming it would hand column
 * zero back to an indented quotation, which is the hole this normalisation was
 * introduced to close. A BOM is an encoding artefact rather than indentation,
 * so it alone is dropped.
 */
export function normaliseCardBody(text) {
  return String(text ?? '').replace(/^\uFEFF/, '').replace(/\s+$/, '')
}

/** A selected category key, or ''. Descriptions and unknown keys grant no authority. */
export function userOwnedCategory(text) {
  return normaliseCardBody(text).match(CATEGORY_RE)?.[1]?.toLowerCase() ?? ''
}

/**
 * The same text with the category line removed. The tag is MACHINE-READABLE
 * AUTHORITY, not card content: the board is German prose the user reads on a
 * phone, and an English `User-owned category: scope-extension.` line in front of
 * every admissible question is jargon aimed at the writer, not at the reader. It
 * is judged and then dropped — the same treatment the settled-ruling escape line
 * gets, and for the same reason.
 */
export function withoutCategoryLine(text) {
  return normaliseCardBody(text).replace(CATEGORY_RE, '')
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
  const text = normaliseCardBody(body)
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
  const text = normaliseCardBody(body)
  if (!head || !text.trim()) {
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
