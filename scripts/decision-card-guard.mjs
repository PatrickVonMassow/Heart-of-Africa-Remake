// Stop hook (point 421, user ruling 29.07.2026): a request for a user DECISION
// exists as a card in "Von dir zu klären" — the chat may carry it as well, never
// instead. The user writes in the chat and does not read there, so a question put
// only into a reply waits in a channel nobody watches.
//
// The decision logic is pure and Vitest-covered (decision-card-guard-core.mjs);
// this wrapper only gathers the transcript, the board and the per-session
// snapshot, and is fail-OPEN: any internal error allows the stop, so a guard bug
// can never trap the session.
//
// THE BASELINE IS TAKEN AT TURN START (point 437 E, 07.08.2026). It used to be
// taken at the guard's FIRST Stop evaluation in a session, which swallowed a card
// added BEFORE that moment: the remedy had been performed, and the block still
// said the board held nothing about the question. `seedDecisionCardBaseline` is
// called from the UserPromptSubmit hook, so the snapshot describes the board as
// the turn BEGAN. That title set now stays immutable through every retry of the
// same turn, which is what keeps a card added after the message from becoming due.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  evaluate,
  evaluateCardReviews,
  evaluateCarriedAnswers,
  reconcileCarriedAnswers,
  sharedDistinctiveTerms,
} from './decision-card-guard-core.mjs'
import { SECTION_TITLES, parseCards, sliceSections } from './dashboard-guard-core.mjs'
import { extractLastAssistantText } from './timestamp-guard-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { readVdzkAnswers, writeVdzkAnswers } from './vdzk-answer.mjs'
import { repoPath } from './repo-paths.mjs'
import { RESPONDER_PROMPT_HEAD } from './chat-watcher-core.mjs'

const DASHBOARD =
  process.env.DECISION_CARD_DASHBOARD || repoPath('.batch-dashboard.html')
const PAUSE = repoPath('.claude/batch-paused')
// Overridable so the tests never touch the live snapshot.
const STATE_PATH =
  process.env.DECISION_CARD_GUARD_STATE ||
  repoPath('.claude/decision-card-guard-state.json')

/** The titles of every "Von dir zu klären" card, or null when the board cannot be
 *  parsed into sections at all — null is the fail-open signal to the core. */
export function vdzkTitles(html) {
  const { sections } = sliceSections(html)
  const section = sections[SECTION_TITLES[1]]
  if (typeof section !== 'string') return null
  return parseCards(section).map((c) => c.title)
}

export const readDecisionCardState = () => {
  try {
    const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
    return state && typeof state === 'object' && !Array.isArray(state) ? state : null
  } catch {
    return null
  }
}

export const writeDecisionCardState = (state) => {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    writeJsonAtomic(STATE_PATH, state)
    return true
  } catch {
    return false
  }
}

/** Extract the user-authored messages from the chat watcher's own prompt.
 *
 * The framing is deliberately discarded: only the JSON-quoted list entries may
 * contribute terms to the decision-card review. Requiring the exact envelope
 * head and its timestamped list makes this a positive channel marker, not an
 * inference from whatever synthetic prompt shapes happen to be known today. */
function responderUserText(text) {
  if (!text.startsWith(RESPONDER_PROMPT_HEAD)) return null
  const list = text.slice(RESPONDER_PROMPT_HEAD.length)
  if (!list.startsWith(' ')) return null

  const item = /- \[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\] ("(?:\\.|[^"\\])*")(?= |$)/y
  const messages = []
  let cursor = 1
  while (cursor < list.length) {
    item.lastIndex = cursor
    const match = item.exec(list)
    if (!match) return null
    let message
    try {
      message = JSON.parse(match[2])
    } catch {
      return null
    }
    if (typeof message !== 'string' || !message.trim()) return null
    messages.push(message)
    cursor = item.lastIndex
    if (cursor < list.length) {
      if (list[cursor] !== ' ') return null
      cursor += 1
    }
  }
  return messages.length ? messages.join('\n') : null
}

/** The last positively identified user message in Claude's JSONL transcript.
 *
 * There are exactly two accepted channels: a CLI entry marked
 * `promptSource: "typed"`, and the chat watcher's own responder envelope. All
 * other `type: "user"` entries are machine traffic and cannot arm a review.
 * Older CLI versions that omit `promptSource` therefore cannot arm the typed
 * channel; that conservative miss is preferable to assigning a duty from
 * machine text. The independently marked chat channel remains available. */
export function extractLastUserMessage(jsonl) {
  if (typeof jsonl !== 'string' || !jsonl.trim()) return null
  let last = null
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (!entry || entry.type !== 'user' || entry.isSidechain) continue
    const content = entry.message?.content
    if (typeof content !== 'string' || !content.trim()) continue
    const id = entry.uuid || entry.message?.id
    if (typeof id !== 'string' || !id.trim()) continue
    if (entry.promptSource === 'typed') last = { id, text: content }
    else {
      const text = responderUserText(content)
      if (text) last = { id, text }
    }
  }
  return last
}

const sessionsOf = (state) => state?.sessions && typeof state.sessions === 'object' ? state.sessions : {}

export function decisionSession(state, sessionId) {
  const session = sessionsOf(state)[sessionId]
  return session && typeof session === 'object' ? session : null
}

function selectedSession(state, sessionId = process.env.CLAUDE_SESSION_ID || '') {
  if (sessionId && decisionSession(state, sessionId)) {
    return { sessionId, session: decisionSession(state, sessionId) }
  }
  const entries = Object.entries(sessionsOf(state)).filter(([, session]) => session && typeof session === 'object')
  if (entries.length === 1) return { sessionId: entries[0][0], session: entries[0][1] }
  throw new Error('cannot identify this session — CLAUDE_SESSION_ID is missing and the guard state is ambiguous')
}

/**
 * Record the board's VDZK cards as they stand at the START of a turn.
 *
 * Called from the UserPromptSubmit hook. Without it the first Stop evaluation of
 * a session has no baseline, reads "no card was added" and can therefore demand
 * a remedy that was already performed in that same turn. Best-effort throughout:
 * a missing board or an unwritable snapshot leaves the guard exactly as it was.
 */
export function seedDecisionCardBaseline(sessionId, { transcriptPath = '' } = {}) {
  try {
    if (!existsSync(DASHBOARD)) return false
    const titles = vdzkTitles(readFileSync(DASHBOARD, 'utf8'))
    if (!Array.isArray(titles)) return false
    const state = readDecisionCardState() ?? {}
    const sessions = sessionsOf(state)
    const prior = decisionSession(state, sessionId) ?? {}
    const userMessage = transcriptPath && existsSync(transcriptPath)
      ? extractLastUserMessage(readFileSync(transcriptPath, 'utf8'))
      : null
    const sameMessage = userMessage && prior.review?.messageId === userMessage.id
    return writeDecisionCardState({
      ...state,
      version: 2,
      sessions: {
        ...sessions,
        [sessionId || '']: {
          titles,
          userMessage,
          review: sameMessage ? prior.review : (userMessage ? { messageId: userMessage.id, kept: {} } : null),
          at: Date.now(),
          seededAtTurnStart: true,
        },
      },
    })
  } catch {
    return false
  }
}

/** Record that the active user message did not answer one or more cards. This
 * command writes guard state only; despite living under board.mjs it never edits
 * or publishes the board, so a non-owner may use it safely. */
export function recordDecisionCardKeep(
  fragments,
  why = '',
  { sessionId = process.env.CLAUDE_SESSION_ID || '' } = {},
) {
  const state = readDecisionCardState()
  if (!state) throw new Error('decision-card guard state is unreadable; wait for the guard to name the active message')
  const selected = selectedSession(state, sessionId)
  const { session } = selected
  if (!session.userMessage?.id || !session.userMessage?.text) {
    throw new Error('no active user message is recorded; wait for the decision-card guard to run')
  }
  if (!Array.isArray(fragments) || !fragments.length) throw new Error('vdzk-keep needs at least one title fragment')
  if (!existsSync(DASHBOARD)) throw new Error('dashboard is missing')
  const currentTitles = vdzkTitles(readFileSync(DASHBOARD, 'utf8'))
  if (!Array.isArray(currentTitles)) throw new Error('cannot parse the board\'s open-question section')
  const due = new Set(Array.isArray(session.titles) ? session.titles : [])
  const candidates = currentTitles.filter((title) => due.has(title))
  const resolved = fragments.map((fragment) => {
    const needle = String(fragment ?? '').trim().toLowerCase()
    if (!needle) throw new Error('vdzk-keep needs a non-empty title fragment')
    const hits = candidates.filter((title) => title.toLowerCase().includes(needle))
    if (!hits.length) throw new Error(`no due open question matching ${JSON.stringify(fragment)}`)
    if (hits.length > 1) throw new Error(`${JSON.stringify(fragment)} matches ${hits.length}: ${hits.join(' | ')}`)
    return hits[0]
  })
  const kept = { ...(session.review?.messageId === session.userMessage.id ? session.review.kept : {}) }
  for (const title of new Set(resolved)) {
    const terms = sharedDistinctiveTerms(session.userMessage.text, title)
    if (terms.length && !String(why).trim()) {
      throw new Error(`${JSON.stringify(title)} shares ${terms.join(', ')} with the user message; add --why "<reason>"`)
    }
    kept[title] = { why: String(why).trim(), at: Date.now() }
  }
  const nextSession = { ...session, review: { messageId: session.userMessage.id, kept } }
  const next = { ...state, sessions: { ...sessionsOf(state), [selected.sessionId]: nextSession } }
  if (!writeDecisionCardState(next)) throw new Error('could not write decision-card guard state')
  return resolved
}

if (isMainModule(import.meta.url)) {
  try {
    let payload = {}
    try {
      payload = JSON.parse(readFileSync(0, 'utf8'))
    } catch {
      /* a manual run has no stdin — the rule is global truth, not session-local */
    }
    const sessionId = (payload && payload.session_id) || ''
    const transcriptPath = payload && payload.transcript_path

    if (existsSync(PAUSE)) process.exit(0) // user-paused: no batch duty in flight
    const nonOwner = heldByOtherLiveOwner(sessionId)
    if (!existsSync(DASHBOARD)) process.exit(0) // no board — dashboard-guard owns that case
    if (!transcriptPath || !existsSync(transcriptPath)) process.exit(0) // nothing to judge

    const titles = vdzkTitles(readFileSync(DASHBOARD, 'utf8'))
    const state = readDecisionCardState()
    const snapshot = decisionSession(state, sessionId)
    const before = Array.isArray(snapshot?.titles) ? snapshot.titles : null
    const cardAddedThisTurn = Boolean(before && Array.isArray(titles) && titles.some((t) => !before.includes(t)))
    const transcript = readFileSync(transcriptPath, 'utf8')
    const userMessage = extractLastUserMessage(transcript)
    // The prompt hook normally records this before any remedy can run. Persist it
    // here as a backstop for clients whose UserPromptSubmit payload lacked the
    // transcript path; keep the turn-start titles immutable until the next user
    // message so a card added after this message is never demanded.
    if (state && snapshot && userMessage && snapshot.userMessage?.id !== userMessage.id) {
      writeDecisionCardState({
        ...state,
        sessions: {
          ...sessionsOf(state),
          [sessionId]: { ...snapshot, userMessage, review: { messageId: userMessage.id, kept: {} } },
        },
      })
    }

    const answers = readVdzkAnswers()
    const answerStateReadable = Array.isArray(answers)
    const reconciled = answerStateReadable && Array.isArray(titles)
      ? reconcileCarriedAnswers(answers, titles)
      : { active: [], cleared: [] }
    if (reconciled.cleared.length) writeVdzkAnswers(reconciled.active)

    const carriedVerdict = evaluateCarriedAnswers({
      entries: reconciled.active,
      currentTitles: titles,
      owner: !nonOwner,
      stateReadable: answerStateReadable,
    })
    if (carriedVerdict.block) {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: carriedVerdict.reason }))
      process.exit(0)
    }

    const activeSnapshot = decisionSession(readDecisionCardState(), sessionId) ?? snapshot
    const reviewVerdict = evaluateCardReviews({
      userMessage,
      cardsAtMessage: activeSnapshot?.titles,
      currentTitles: titles,
      review: activeSnapshot?.review,
      carriedAnswers: reconciled.active,
      nonOwner,
      stateReadable: Boolean(activeSnapshot),
    })
    if (reviewVerdict.block) {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: reviewVerdict.reason }))
      process.exit(0)
    }

    // The original direction is a batch-owner duty: a non-owner is explicitly
    // barred from creating the board card that could satisfy it.
    if (nonOwner) process.exit(0)

    const verdict = evaluate({
      replyText: extractLastAssistantText(transcript),
      vdzkTitles: titles,
      cardAddedThisTurn,
    })
    if (verdict.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: verdict.reason }))
    process.exit(0)
  } catch (e) {
    console.error(`decision-card-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
