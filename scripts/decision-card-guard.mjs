// Stop hook (point 421, user ruling 29.07.2026): a request for a user DECISION
// exists as a card in "Von dir zu klären" — the chat may carry it as well, never
// instead. The user writes in the chat and does not read there, so a question put
// only into a reply waits in a channel nobody watches.
//
// The decision logic is pure and Vitest-covered (decision-card-guard-core.mjs);
// this wrapper only gathers the transcript, the board and the per-session
// snapshot, and is fail-OPEN: any internal error allows the stop, so a guard bug
// can never trap the session.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate } from './decision-card-guard-core.mjs'
import { SECTION_TITLES, parseCards, sliceSections } from './dashboard-guard-core.mjs'
import { extractLastAssistantText } from './timestamp-guard-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'

const DASHBOARD = fileURLToPath(new URL('../.batch-dashboard.html', import.meta.url))
const PAUSE = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))
// Overridable so the tests never touch the live snapshot.
const STATE_PATH =
  process.env.DECISION_CARD_GUARD_STATE ||
  fileURLToPath(new URL('../.claude/decision-card-guard-state.json', import.meta.url))

/** The titles of every "Von dir zu klären" card, or null when the board cannot be
 *  parsed into sections at all — null is the fail-open signal to the core. */
export function vdzkTitles(html) {
  const { sections } = sliceSections(html)
  const section = sections[SECTION_TITLES[1]]
  if (typeof section !== 'string') return null
  return parseCards(section).map((c) => c.title)
}

const readState = () => {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

const writeState = (state) => {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    writeFileSync(STATE_PATH, JSON.stringify(state), 'utf8')
  } catch {
    /* the snapshot only widens the pass; losing it can only block, never leak */
  }
}

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
  if (heldByOtherLiveOwner(sessionId)) process.exit(0) // a non-owner session stands down
  if (!existsSync(DASHBOARD)) process.exit(0) // no board — dashboard-guard owns that case
  if (!transcriptPath || !existsSync(transcriptPath)) process.exit(0) // nothing to judge

  const titles = vdzkTitles(readFileSync(DASHBOARD, 'utf8'))
  // A CARD WRITTEN IN THIS TURN COUNTS, whatever it is called. The guard runs at
  // the turn end, so "since the previous turn end" is the turn — one snapshot per
  // session, compared and then replaced.
  const state = readState()
  const before = state.sessionId === sessionId && Array.isArray(state.titles) ? state.titles : null
  const cardAddedThisTurn = Boolean(before && Array.isArray(titles) && titles.some((t) => !before.includes(t)))
  if (Array.isArray(titles)) writeState({ sessionId, titles, at: Date.now() })

  const verdict = evaluate({
    replyText: extractLastAssistantText(readFileSync(transcriptPath, 'utf8')),
    vdzkTitles: titles,
    cardAddedThisTurn,
  })
  if (verdict.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: verdict.reason }))
  process.exit(0)
} catch (e) {
  console.error(`decision-card-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
