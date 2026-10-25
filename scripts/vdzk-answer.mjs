// Carrier for an answer written into a session that may not edit the board.
// Recording is local and owner-independent; `--applied` clears the carried
// answer of the named card once the owner has acted on it. Past the shared core
// deadline, batch-autostart invokes `--redeem-due`, which removes exactly the
// named VDZK card, so a long owner wait cannot leave the answered card standing.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { answerDeadline, dueCarriedAnswers, reconcileCarriedAnswers } from './decision-card-guard-core.mjs'
import { SECTION_TITLES, parseCards, sliceSections } from './dashboard-guard-core.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { extractLastUserMessage } from './decision-card-guard.mjs'
import { projectSlug } from './context-watermark.mjs'

const REPO = REPO_ROOT
const DASHBOARD = process.env.DECISION_CARD_DASHBOARD || repoPath('.batch-dashboard.html')
const ANSWERS_PATH = process.env.VDZK_ANSWERS_PATH || repoPath('.claude/vdzk-answers.json')
const GUARD_STATE_PATH =
  process.env.DECISION_CARD_GUARD_STATE ||
  repoPath('.claude/decision-card-guard-state.json')

export function readVdzkAnswers() {
  if (!existsSync(ANSWERS_PATH)) return []
  try {
    const entries = JSON.parse(readFileSync(ANSWERS_PATH, 'utf8'))
    return Array.isArray(entries) ? entries : null
  } catch {
    return null
  }
}

export function writeVdzkAnswers(entries) {
  try {
    mkdirSync(dirname(ANSWERS_PATH), { recursive: true })
    writeJsonAtomic(ANSWERS_PATH, entries)
    return true
  } catch {
    return false
  }
}

export function openCardTitles(html) {
  try {
    const section = sliceSections(String(html ?? '')).sections[SECTION_TITLES[1]]
    return typeof section === 'string' ? parseCards(section).map((card) => card.title) : null
  } catch {
    return null
  }
}

function currentTitles() {
  if (!existsSync(DASHBOARD)) throw new Error('dashboard is missing')
  const titles = openCardTitles(readFileSync(DASHBOARD, 'utf8'))
  if (!Array.isArray(titles)) throw new Error('cannot parse the board\'s open-question section')
  return titles
}

export function resolveTitle(fragment, titles) {
  const needle = String(fragment ?? '').trim().toLowerCase()
  if (!needle) throw new Error('need a non-empty card-title fragment')
  const hits = (Array.isArray(titles) ? titles : []).filter((title) => title.toLowerCase().includes(needle))
  if (!hits.length) throw new Error(`no open question matching ${JSON.stringify(fragment)}`)
  if (hits.length > 1) throw new Error(`${JSON.stringify(fragment)} matches ${hits.length}: ${hits.join(' | ')}`)
  return hits[0]
}

/** The harness exports CLAUDE_CODE_SESSION_ID; CLAUDE_SESSION_ID stays an override. */
const envSessionId = () => process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || ''

/** The session's own transcript, by exact id only — never a "newest" guess. */
function transcriptMessage(sessionId) {
  if (!sessionId) return null
  try {
    const path = join(homedir(), '.claude', 'projects', projectSlug(REPO_ROOT), `${sessionId}.jsonl`)
    return existsSync(path) ? extractLastUserMessage(readFileSync(path, 'utf8')) : null
  } catch {
    return null
  }
}

/** The guard's turn-start seed is a cache: concurrent sessions can drop a
 * standing-down session's entry, so the transcript is the fallback source. */
function activeSource(sessionId = envSessionId()) {
  let state = null
  try {
    state = JSON.parse(readFileSync(GUARD_STATE_PATH, 'utf8'))
  } catch {
    /* fall through to the transcript */
  }
  const sessions = state?.sessions && typeof state.sessions === 'object' ? state.sessions : {}
  let selected = sessionId ? sessions[sessionId] : null
  let selectedId = sessionId
  if (!selected && !sessionId) {
    const entries = Object.entries(sessions).filter(([, value]) => value && typeof value === 'object')
    if (entries.length === 1) [selectedId, selected] = entries[0]
  }
  if (selected?.userMessage?.id) return { sessionId: selectedId, messageId: selected.userMessage.id }
  const message = transcriptMessage(sessionId)
  if (message?.id) return { sessionId, messageId: message.id }
  throw new Error('cannot identify this session\'s active user message; wait for the guard to run')
}

export function recordVdzkAnswer(fragment, answer, { now = Date.now(), sessionId } = {}) {
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('--answer needs what the user decided')
  const cardTitle = resolveTitle(fragment, currentTitles())
  const source = activeSource(sessionId)
  const entries = readVdzkAnswers()
  if (!Array.isArray(entries)) throw new Error('the VDZK answer carrier is unreadable; refusing to overwrite it')
  const recordedAt = Number(now)
  const entry = {
    cardTitle,
    answer: answer.trim(),
    sourceSessionId: source.sessionId,
    sourceMessageId: source.messageId,
    recordedAt,
    deadlineAt: answerDeadline(recordedAt),
  }
  const next = entries.filter(
    (old) => !(old?.cardTitle === cardTitle && old?.sourceMessageId === source.messageId),
  )
  next.push(entry)
  if (!writeVdzkAnswers(next)) throw new Error('could not append to the VDZK answer carrier')
  return entry
}

export function markVdzkAnswerApplied(fragment) {
  const entries = readVdzkAnswers()
  if (!Array.isArray(entries)) throw new Error('the VDZK answer carrier is unreadable')
  const titles = [...new Set(entries.map((entry) => entry?.cardTitle).filter(Boolean))]
  const title = resolveTitle(fragment, titles)
  const next = entries.filter((entry) => entry?.cardTitle !== title)
  if (!writeVdzkAnswers(next)) throw new Error('could not clear the applied VDZK answer')
  return title
}

/** Apply due answers without an owner. Vanished cards clear immediately; a board
 * command that fails leaves its entry intact for the next tick. */
export function redeemDueVdzkAnswers({
  now = Date.now(),
  runBoard = (title) => execFileSync(process.execPath, ['scripts/board.mjs', 'vdzk-remove', title], {
    cwd: REPO,
    encoding: 'utf8',
    windowsHide: true,
  }),
} = {}) {
  const entries = readVdzkAnswers()
  if (!Array.isArray(entries)) return { applied: [], cleared: [], failed: [], unreadable: true }
  let titles
  try {
    titles = currentTitles()
  } catch {
    return { applied: [], cleared: [], failed: [], unreadable: true }
  }
  const reconciled = reconcileCarriedAnswers(entries, titles)
  const due = dueCarriedAnswers(reconciled.active, now)
  const applied = []
  const failed = []
  for (const entry of due) {
    try {
      runBoard(entry.cardTitle)
      applied.push(entry)
    } catch (error) {
      failed.push({ entry, error: error?.message || String(error) })
    }
  }
  const removed = new Set([...reconciled.cleared, ...applied])
  const next = entries.filter((entry) => !removed.has(entry))
  if (next.length !== entries.length && !writeVdzkAnswers(next)) {
    return { applied: [], cleared: [], failed: [...failed, { error: 'carrier write failed' }], unreadable: true }
  }
  return { applied, cleared: reconciled.cleared, failed, unreadable: false }
}

function flagValue(args, flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}

if (isMainModule(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args[0] === '--applied') {
      if (!args[1]) throw new Error('usage: vdzk-answer.mjs --applied "<fragment>"')
      console.log(`carried answer cleared: ${markVdzkAnswerApplied(args[1])}`)
    } else if (args[0] === '--redeem-due') {
      const result = redeemDueVdzkAnswers()
      if (result.unreadable) throw new Error('carrier or board unreadable; allowing the next tick to retry')
      for (const entry of result.cleared) console.log(`vanished card cleared: ${entry.cardTitle}`)
      for (const entry of result.applied) console.log(`due answer applied: ${entry.cardTitle}`)
      for (const failure of result.failed) console.error(`due answer retained: ${failure.entry?.cardTitle ?? 'unknown'} (${failure.error})`)
      if (result.failed.length) process.exitCode = 1
    } else {
      const answer = flagValue(args, '--answer')
      const fragment = args[0]
      const sessionId = flagValue(args, '--session')
      if (!fragment || answer == null || sessionId === undefined || sessionId === '') {
        throw new Error('usage: vdzk-answer.mjs "<fragment>" --answer "<what the user decided>" [--session <id>]')
      }
      const entry = recordVdzkAnswer(fragment, answer, sessionId ? { sessionId } : {})
      console.log(`answer carried for ${entry.cardTitle}; deadline ${new Date(entry.deadlineAt).toISOString()}`)
    }
  } catch (error) {
    console.error(`vdzk-answer: ${error.message}`)
    process.exitCode = 1
  }
}
