// DECLARING WORK THAT IS IN FLIGHT (point 388, fifth live finding 28.07.2026) —
// the IO half. The decision logic is pure in scripts/batch-in-flight-core.mjs;
// this module only reads/writes the marker and runs the probes that PROVE the
// declared work is still running. CLI:
//
//   node scripts/batch-in-flight.mjs --waiting-on "<what>" [--pid N]… [--branch REF]…
//                                    [--worktree PATH]… [--log PATH]…
//   node scripts/batch-in-flight.mjs --status   what the Stop hook would decide
//   node scripts/batch-in-flight.mjs --clear    the wait is over
//
// Declaring is DELIBERATE and verified up front, exactly like taking a boundary:
// the command refuses unless this is the batch lock's owner and every piece of
// evidence checks out at the moment it is written, so the session learns at the
// declaration rather than at a blocked turn end.
//
// It does NOT hand the batch over and does NOT touch the lock: a waiting session
// is still the working session, and the launcher must keep seeing a live owner.
// The ONLY thing it changes is that `batch-progress-guard` stops demanding work
// the session cannot do while it waits — and it stops the moment the evidence
// stops checking out, or the declaration ages out.
import { readFileSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { readOwnerLock, cheapProbePid, ourClaudeProcess, statePathsFor, LOCK_PATH } from './batch-singleton.mjs'
import { assessInFlight, describeInFlight, IN_FLIGHT_MAX_AGE_MS } from './batch-in-flight-core.mjs'

export const IN_FLIGHT_PATH = statePathsFor(LOCK_PATH).inFlightPath

/** The calibratable maximum age, HOA_IN_FLIGHT_MAX_MIN in minutes. Reading it
 *  here (not in the core) keeps the decision function pure and testable. */
export function maxAgeMs(env = process.env) {
  const raw = Number(env.HOA_IN_FLIGHT_MAX_MIN)
  return Number.isFinite(raw) && raw > 0 ? raw * 60 * 1000 : IN_FLIGHT_MAX_AGE_MS
}

export function readDeclaration(path = IN_FLIGHT_PATH) {
  try {
    const d = JSON.parse(readFileSync(path, 'utf8'))
    return d && typeof d === 'object' ? d : null
  } catch {
    return null
  }
}

export function writeDeclaration(declaration, path = IN_FLIGHT_PATH) {
  writeJsonAtomic(path, declaration)
}

export function clearDeclaration(path = IN_FLIGHT_PATH) {
  try {
    rmSync(path, { force: true })
    return true
  } catch {
    return false
  }
}

// --- The probes ----------------------------------------------------------------

/** Does this git ref exist? Any git failure answers NO — evidence that cannot be
 *  established never counts as established. execFile, never a shell (a `^` in a
 *  revision is eaten by cmd.exe). */
export function refExists(ref, { cwd = REPO_ROOT } = {}) {
  const name = String(ref ?? '').trim()
  if (!name || /[\s~^:?*[\]\\]/.test(name)) return false
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${name}^{commit}`], {
      cwd,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

export function dirExists(path) {
  try {
    return statSync(String(path)).isDirectory()
  } catch {
    return false
  }
}

export function mtimeOf(path) {
  try {
    return statSync(String(path)).mtimeMs
  } catch {
    return null
  }
}

const probes = { probePid: cheapProbePid, refExists, dirExists, mtimeOf }

/**
 * Everything the Stop hook needs, gathered. Returns the core's assessment plus
 * the declaration it judged. Cheap in the common case: with no marker on disk it
 * returns before any probe runs, so an ordinary turn end pays nothing for this.
 */
export function gatherInFlight(sid, { now = Date.now(), lockPath = LOCK_PATH, env = process.env } = {}) {
  const path = statePathsFor(lockPath).inFlightPath
  const declaration = readDeclaration(path)
  if (!declaration) return { declaration: null, live: false, reason: 'no-declaration', summary: '', items: [] }
  // The ancestor walk is only needed when the session id no longer matches (a
  // context compaction) — it is the expensive probe, so it stays behind that.
  const ancestor = declaration.sessionId === sid ? null : ourClaudeProcess(sid, { lockPath })
  const assessment = assessInFlight({
    declaration,
    sid,
    ancestor,
    now,
    maxAgeMs: maxAgeMs(env),
    ...probes,
  })
  return { declaration, ...assessment }
}

// --- CLI -----------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (isMain) {
  const argv = process.argv.slice(2)
  const sid = readOwnerLock()?.sessionId ?? ''
  const fail = (msg) => {
    console.error(msg)
    process.exit(1)
  }
  const usage =
    'usage: node scripts/batch-in-flight.mjs --waiting-on "<what>" [--pid N] [--branch REF] ' +
    '[--worktree PATH] [--log PATH] | --status | --clear'

  if (argv[0] === '--clear') {
    clearDeclaration()
    console.log('in-flight declaration cleared — the ordinary "do not stop the batch" rule applies again.')
  } else if (argv[0] === '--status' || argv.length === 0) {
    const g = gatherInFlight(sid)
    console.log(JSON.stringify({ ownerSessionId: sid || null, maxAgeMs: maxAgeMs(), ...g }, null, 2))
    if (!g.declaration) console.log(`\nNothing declared.\n${usage}`)
    else if (g.live) console.log(`\nA stop would be ALLOWED — waiting on ${describeInFlight(g, g.declaration)}`)
    else console.log(`\nA stop would be BLOCKED (${g.reason}).`)
  } else if (argv[0] === '--waiting-on') {
    const waitingOn = String(argv[1] ?? '').trim()
    if (!waitingOn) fail(`--waiting-on needs a description of the wait.\n${usage}`)
    const evidence = []
    for (let i = 2; i < argv.length; i += 2) {
      const flag = argv[i]
      const value = argv[i + 1]
      if (value === undefined) fail(`${flag} needs a value.\n${usage}`)
      if (flag === '--pid') evidence.push({ kind: 'pid', pid: Number(value) })
      else if (flag === '--branch') evidence.push({ kind: 'branch', ref: value })
      else if (flag === '--worktree') evidence.push({ kind: 'worktree', path: value })
      else if (flag === '--log') evidence.push({ kind: 'log', path: value })
      else fail(`unknown option "${flag}".\n${usage}`)
    }
    if (evidence.length === 0) {
      fail(
        'no EVIDENCE given. A declaration is only honoured while a probe can confirm the work is still ' +
          'running, so it must name at least one of: --pid <background process>, --branch <agent branch>, ' +
          `--worktree <agent worktree>, --log <file the run is writing to>.\n${usage}`,
      )
    }
    const lock = readOwnerLock()
    if (!sid || !lock) {
      fail(
        'no batch lock owner — only the session that owns .claude/batch-lock.json waits on behalf of the ' +
          'batch. Nothing recorded.',
      )
    }
    const now = Date.now()
    const declaration = {
      v: 1,
      sessionId: sid,
      // The lock's process identity, so a context compaction that mints a new
      // session id does not orphan the declaration (resolveOwnership, point 388).
      pid: typeof lock.pid === 'number' ? lock.pid : null,
      pidStartedAt: typeof lock.pidStartedAt === 'number' ? lock.pidStartedAt : null,
      at: now,
      waitingOn,
      evidence,
    }
    // Verify NOW, so a typo is caught here and not at a turn end that then blocks
    // with a reason nobody expected.
    const check = assessInFlight({ declaration, sid, now, maxAgeMs: maxAgeMs(), ...probes })
    if (!check.live) {
      fail(
        `the evidence does not check out (${check.reason}): ${check.summary || 'nothing verifiable'}. ` +
          'Nothing recorded — a declaration is only worth as much as what proves it.',
      )
    }
    writeDeclaration(declaration)
    const mins = Math.round(maxAgeMs() / 60000)
    console.log(
      `waiting on ${waitingOn} — recorded: ${check.summary}. The turn may now end while this holds. It ` +
        `expires in ${mins} min and stops holding the MOMENT any of it stops checking out (a finished agent, ` +
        'a dead process, a silent log), so re-declare after every change and clear it with --clear when the ' +
        'wait is over. The batch lock stays HELD: no successor is spawned, this session is still the batch.',
    )
  } else {
    fail(`unknown option "${argv[0]}".\n${usage}`)
  }
}
