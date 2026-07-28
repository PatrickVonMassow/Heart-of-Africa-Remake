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
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import {
  readOwnerLock,
  probePid,
  ourClaudeProcess,
  statePathsFor,
  LOCK_PATH,
  IN_FLIGHT_PATH,
} from './batch-singleton.mjs'
import {
  assessInFlight,
  describeInFlight,
  selfReferentialEvidence,
  IN_FLIGHT_MAX_AGE_MS,
} from './batch-in-flight-core.mjs'

export { IN_FLIGHT_PATH }

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

/**
 * WHEN did this branch last receive a commit? Epoch ms, or null when the ref does
 * not resolve. Existence was not enough (four-eyes review): ~94 `feat/*` and
 * `worktree-agent-*` branches live in this repository, so "the branch is there"
 * is true of work that finished days ago. Any git failure answers null — evidence
 * that cannot be established never counts as established. execFile, never a shell
 * (a `^` in a revision is eaten by cmd.exe).
 */
export function refTipAt(ref, { cwd = REPO_ROOT } = {}) {
  const name = String(ref ?? '').trim()
  if (!name || /[\s~^:?*[\]\\]/.test(name)) return null
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', `${name}^{commit}`], {
      cwd,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const secs = Number(out)
    return Number.isFinite(secs) && secs > 0 ? secs * 1000 : null
  } catch {
    return null
  }
}

/**
 * WHEN did git last do something in this worktree? Epoch ms, or null when the
 * path is not a checkout (or is gone). A worktree's `.git` is a FILE pointing at
 * `…/.git/worktrees/<name>`; that directory carries the index, HEAD and
 * COMMIT_EDITMSG a working agent rewrites on every commit, and the directory's
 * own mtime moves with each of those renames. The newest of them is the answer —
 * the same "is anything still happening" question the log kind asks.
 */
export function worktreeActiveAt(path) {
  const stamp = (p) => {
    try {
      return statSync(p).mtimeMs
    } catch {
      return null
    }
  }
  const root = String(path ?? '').trim()
  if (!root) return null
  let gitdir = null
  const dot = join(root, '.git')
  try {
    const st = statSync(dot)
    if (st.isDirectory()) gitdir = dot
    else {
      const m = readFileSync(dot, 'utf8').match(/^gitdir:\s*(.+)$/m)
      gitdir = m ? resolve(root, m[1].trim()) : null
    }
  } catch {
    return null // no checkout there any more
  }
  if (!gitdir) return null
  const stamps = [gitdir, join(gitdir, 'index'), join(gitdir, 'HEAD'), join(gitdir, 'COMMIT_EDITMSG')]
    .map(stamp)
    .filter((v) => typeof v === 'number')
  return stamps.length ? Math.max(...stamps) : null
}

export function mtimeOf(path) {
  try {
    return statSync(String(path)).mtimeMs
  } catch {
    return null
  }
}

/** The branch this checkout has checked out, or null when it cannot be read (a
 *  detached HEAD, or no git at all). Only used to REFUSE naming it as evidence,
 *  so an unreadable answer refuses nothing extra. */
export function currentBranchOf({ cwd = REPO_ROOT } = {}) {
  try {
    const out = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out && out !== 'HEAD' ? out : null
  } catch {
    return null
  }
}

// The FULL probe, not the cheap one: `cheapProbePid` answers existence only (and
// true on EPERM), so a reused pid would keep a declaration alive on a stranger's
// process. The start time is what makes a pid an identity.
const probes = { probePid, refTipAt, worktreeActiveAt, mtimeOf }

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
      if (flag === '--pid') {
        // The start time is recorded WITH the pid, so a later probe can tell the
        // same process from a stranger that inherited the number.
        const pid = Number(value)
        const probe = Number.isInteger(pid) && pid > 0 ? probePid(pid) : { exists: false, startedAt: null }
        if (probe.exists === true && typeof probe.startedAt !== 'number') {
          fail(
            `the start time of pid ${pid} could not be established, so a reused pid could later pass as this ` +
              'process. Declare something else instead (--log <the file the run writes to> is the closest ' +
              'equivalent). Nothing recorded.',
          )
        }
        evidence.push({ kind: 'pid', pid, startedAt: probe.startedAt })
      }
      else if (flag === '--branch') evidence.push({ kind: 'branch', ref: value })
      else if (flag === '--worktree') evidence.push({ kind: 'worktree', path: value })
      else if (flag === '--log') evidence.push({ kind: 'log', path: value })
      else fail(`unknown option "${flag}".\n${usage}`)
    }
    // Evidence that cannot go quiet is refused HERE (four-eyes review
    // 28.07.2026): the repo root is git-active whenever the session runs any git
    // command, and `main` / this checkout's own branch move on work that is not
    // the work being waited for. Such a declaration would hold indefinitely AND
    // silence the launcher's silent-owner report, leaving the session less
    // observed than declaring nothing.
    const selfReferential = selfReferentialEvidence({
      evidence,
      repoRoot: REPO_ROOT,
      currentBranch: currentBranchOf(),
    })
    if (selfReferential.length > 0) {
      fail(
        'this evidence cannot go quiet, so it proves nothing:\n' +
          selfReferential.map((p) => `  --${p.kind} ${p.value} — ${p.why}`).join('\n') +
          '\nName what the DELEGATED work touches instead: the agent\'s own feat/… branch, its own worktree ' +
          'path, the pid of the background run, or the log file that run writes to. Nothing recorded.',
      )
    }
    if (evidence.length === 0) {
      fail(
        'no EVIDENCE given. A declaration is only honoured while a probe can confirm the work is still ' +
          'RUNNING — not merely that it once existed — so it must name at least one of: --pid <background ' +
          'process, alive and the same process>, --branch <agent branch, committed to recently>, --worktree ' +
          `<agent worktree, git-active recently>, --log <file the run is still writing to>.\n${usage}`,
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
        `expires in ${mins} min and stops holding the MOMENT any of it stops checking out (a dead or replaced ` +
        'process, a branch or worktree that has gone quiet, a silent log — none of them may merely EXIST, all ' +
        'must still be moving), so re-declare after every change and clear it with --clear when the ' +
        'wait is over. The batch lock stays HELD: no successor is spawned, this session is still the batch.',
    )
  } else {
    fail(`unknown option "${argv[0]}".\n${usage}`)
  }
}
