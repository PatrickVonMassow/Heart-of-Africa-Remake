// Stop hook: a finding must not die with the session that made it.
//
// The decision logic is pure and Vitest-covered in findings-core.mjs; this
// wrapper only reads the transcript and the carrier, and is FAIL-OPEN — an
// unreadable transcript, a missing turn stamp or an internal error all allow
// the stop, so a bug in here can never trap a session. That direction is
// deliberate and differs from timestamp-guard: this guard asks for judgement
// ("was there something worth keeping?"), and a guard that blocks on its own
// blindness would train the reader to route around it.
import { readFileSync } from 'node:fs'
import { auditFindings, formatFindings, parseCarrier, tallyTurn, turnCalls } from './findings-core.mjs'
import { carrierPath, ownsBatch } from './findings-paths.mjs'
import { repoPath } from './repo-paths.mjs'

const STATE_PATH = repoPath('.claude/dashboard-state.json')

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function gather(input) {
  const state = readJson(STATE_PATH)
  const argSession = (() => {
    const i = process.argv.indexOf('--session')
    return i >= 0 ? process.argv[i + 1] : null
  })()
  const sessionId = (input && (input.session_id || input.sessionId)) || argSession
  const transcriptPath = input && (input.transcript_path || input.transcriptPath)
  // THIS session's own turn boundary. The shared `turnStartedAt` is written by
  // the batch owner alone, so a session standing down — the very one this
  // guard exists for — would otherwise measure its turn against a stranger's
  // clock: too young and it counts nothing, too old and it counts several of
  // its own past turns. Falling back to the shared field keeps an owner that
  // predates the per-session stamp working.
  const bySession = (state && state.turnStartedAtBySession) || {}
  const own = sessionId ? Number(bySession[sessionId]) : NaN
  const turnStartedAt = Number.isFinite(own) && own > 0 ? own : Number(state && state.turnStartedAt)
  return { turnStartedAt, sessionId, transcriptPath }
}

function main() {
  // --status must NOT read stdin first: on an interactive console that blocks
  // on the TTY forever, which is why board-first-guard orders it this way too.
  const status = process.argv.includes('--status')
  let input = {}
  if (!status) {
    try {
      const raw = readFileSync(0, 'utf8')
      if (raw.trim()) input = JSON.parse(raw)
    } catch {
      /* no stdin — fail open, judge what can be judged without it */
    }
  }

  const { turnStartedAt, sessionId, transcriptPath } = gather(input)
  const owner = ownsBatch(sessionId)
  const carrier = parseCarrier((() => {
    try {
      return readFileSync(carrierPath(), 'utf8')
    } catch {
      return ''
    }
  })())

  // No turn stamp → the UserPromptSubmit hook never ran (a manual invocation,
  // a resumed session). Judging a turn whose start is unknown would count an
  // arbitrary slice of history, so condition 1 stands down; condition 2 does
  // not depend on the turn at all and still applies.
  let tally = { investigative: 0, agents: 0, records: [] }
  if (Number.isFinite(turnStartedAt) && turnStartedAt > 0 && transcriptPath) {
    try {
      tally = tallyTurn(turnCalls(readFileSync(transcriptPath, 'utf8'), turnStartedAt))
    } catch {
      /* unreadable transcript — fail open on condition 1 */
    }
  }

  const verdict = auditFindings({ tally, ownsBatch: owner, carrierPending: carrier.pending.length })

  if (status) {
    console.log(`turn calls     : ${tally.investigative} investigative, ${tally.agents} agent(s)`)
    console.log(`turn records   : ${tally.records.length ? tally.records.join(', ') : '<none>'}`)
    console.log(
      `owns the batch : ${sessionId ? (owner ? 'yes' : 'no') : 'unbekannt — keine session_id (--session <id> nachreichen)'}`,
    )
    console.log(`carrier        : ${carrier.pending.length} waiting, ${carrier.drained} landed`)
    console.log(`verdict        : ${verdict.ok ? 'allow' : 'BLOCK'}`)
    if (!verdict.ok) console.log(formatFindings(verdict.violations))
    return
  }

  if (!verdict.ok) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: formatFindings(verdict.violations) }) + '\n')
  }
}

try {
  main()
} catch (e) {
  // Fail-open, loudly: the session keeps working, the reason reaches stderr.
  console.error(`findings-guard: internal error, allowing the stop — ${e && e.message}`)
}
