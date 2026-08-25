// Stop hook: a finding must not die with the session that made it.
//
// The decision logic is pure and Vitest-covered in findings-core.mjs; this
// wrapper only reads the transcript and the carrier, and is FAIL-OPEN — an
// unreadable transcript, a missing turn stamp or an internal error all allow
// the stop, so a bug in here can never trap a session. That direction is
// deliberate and differs from timestamp-guard: this guard asks for judgement
// ("was there something worth keeping?"), and a guard that blocks on its own
// blindness would train the reader to route around it.
import { readFileSync, statSync } from 'node:fs'
import { auditFindings, formatFindings, parseCarrier, tallyTurn, turnCalls, turnTakesBoundary } from './findings-core.mjs'
import { carrierPath, ownsBatch } from './findings-paths.mjs'
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { gatherGuardDutyContext } from './guard-duty.mjs'

const STATE_PATH = repoPath('.claude/dashboard-state.json')
const IN_FLIGHT_PATH = repoPath('.claude/batch-in-flight.json')

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** When a file was last written, or null. Null judges nothing. */
function mtimeMs(path) {
  try {
    return statSync(path).mtimeMs
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

/**
 * Everything the core needs — exported so the guard preflight predicts this gate
 * from the SAME gathering the Stop hook uses rather than a second copy of it,
 * which would drift and hand back a false "clean" (point 437 E).
 *
 * It never reports "not applicable": every stand-down this guard has is a
 * VERDICT of `auditFindings` (not the batch owner → nothing owed), not a refusal
 * to look — so the preflight sees the same allow the Stop hook would give.
 */
export function gatherFindingsInputs({ sessionId = '', transcriptPath = null } = {}) {
  const resolved = gather({ session_id: sessionId, transcript_path: transcriptPath })
  const owner = ownsBatch(resolved.sessionId)
  const fence = gatherGuardDutyContext({ sessionId: resolved.sessionId })
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
  // Whether this turn TAKES the boundary is read from the same calls (point
  // 462) — the request gate fires there and nowhere else. No stamp, no calls,
  // no boundary: the gate then simply stands down, like condition 1.
  let atBoundary = false
  if (Number.isFinite(resolved.turnStartedAt) && resolved.turnStartedAt > 0 && resolved.transcriptPath) {
    try {
      const calls = turnCalls(readFileSync(resolved.transcriptPath, 'utf8'), resolved.turnStartedAt)
      tally = tallyTurn(calls)
      atBoundary = turnTakesBoundary(calls)
    } catch {
      /* unreadable transcript — fail open on condition 1 */
    }
  }

  return {
    applicable: true,
    sessionId: resolved.sessionId,
    owner,
    carrier,
    inputs: {
      tally,
      ownsBatch: owner,
      sessionId: resolved.sessionId,
      fence,
      carrierPending: carrier.pending.length,
      carrierRequests: carrier.requests.length,
      atBoundary,
      // WHEN the declaration was last WRITTEN, so the delegation exemption can
      // be earned rather than claimed (point 437 G): a turn that ran the command
      // and had it REFUSED — no lock, no evidence, dead evidence — leaves this
      // file untouched, and the exemption then does not apply to it.
      declarationWrittenAt: mtimeMs(IN_FLIGHT_PATH),
      turnStartedAt: resolved.turnStartedAt,
    },
  }
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

  const gathered = gatherFindingsInputs({
    sessionId: (input && (input.session_id || input.sessionId)) || '',
    transcriptPath: (input && (input.transcript_path || input.transcriptPath)) || null,
  })
  const { sessionId, owner, carrier } = gathered
  const { tally, atBoundary } = gathered.inputs
  const verdict = auditFindings(gathered.inputs)

  if (status) {
    console.log(`turn calls     : ${tally.investigative} investigative, ${tally.agents} agent(s)`)
    console.log(`turn records   : ${tally.records.length ? tally.records.join(', ') : '<none>'}`)
    console.log(
      `owns the batch : ${sessionId ? (owner ? 'yes' : 'no') : 'unbekannt — keine session_id (--session <id> nachreichen)'}`,
    )
    console.log(`at the boundary: ${atBoundary ? 'yes' : 'no'}`)
    console.log(`context fence  : ${gathered.inputs.fence.closed ? 'closed — duties pass to successor' : 'open'}`)
    console.log(
      `carrier        : ${carrier.pending.length} waiting, ${carrier.requests.length} request(s), ${carrier.drained} landed`,
    )
    console.log(`verdict        : ${verdict.ok ? 'allow' : 'BLOCK'}`)
    if (!verdict.ok) console.log(formatFindings(verdict.violations))
    return
  }

  if (!verdict.ok) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: formatFindings(verdict.violations) }) + '\n')
  } else if (verdict.deferred.length) {
    process.stdout.write(JSON.stringify({ systemMessage: verdict.deferred.map((d) => d.detail).join('\n') }) + '\n')
  }
}

// Gated on isMainModule since point 437 E: the guard preflight IMPORTS this
// module for its gather step, and an ungated `main()` would read fd 0 — on an
// interactive console, forever.
if (isMainModule(import.meta.url)) {
  try {
    main()
  } catch (e) {
    // Fail-open, loudly: the session keeps working, the reason reaches stderr.
    console.error(`findings-guard: internal error, allowing the stop — ${e && e.message}`)
  }
}
