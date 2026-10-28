// THE WAIT DECLARED BY THE COMMAND THAT WAITS (point 1308, U5).
//
// `author-delegate.mjs` and `ask-lane.mjs` block on their child for minutes to
// an hour, and the owner used to declare that wait by hand first
// (`batch-in-flight.mjs --waiting-on …`) and clear it afterwards — two calls per
// delegation. These helpers make the same two calls on the owner's behalf,
// through the SAME command line, so every check the manual declaration passes
// (evidence, point attribution, ETA, lease extension) is the one that runs here.
//
// NEVER WORSE THAN TODAY:
//   - only the batch OWNER declares (its claude process is the lock's pid), and
//     not under a pause; every other session declares nothing, as today;
//   - an existing declaration is never overwritten — another wait keeps its
//     record and this one is left to the hand, with the command printed;
//   - a refused or failing declaration prints the manual command and the wait
//     goes on; only our own entry (matched by its waitingOn) is ever cleared;
//   - a killed command leaves its declaration, which expires after
//     IN_FLIGHT_MAX_AGE_MS like a hand-written one.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { readDeclaration } from './batch-in-flight.mjs'
import { findClaudeAncestor, readOwnerLock } from './batch-singleton.mjs'

export const DECLARE_TIMEOUT_MS = 15000

const runInFlight = (args) =>
  execFileSync(process.execPath, [join('scripts', 'batch-in-flight.mjs'), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: DECLARE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })

/** Is this process working for the session that owns the batch lock? */
export function runsForOwner({ lock = readOwnerLock(), ancestor = findClaudeAncestor() } = {}) {
  return Boolean(lock && ancestor && Number.isInteger(lock.pid) && lock.pid === ancestor.pid)
}

const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`

/** The declaration arguments, and the same thing as the command a person types. */
export function waitArgs({ waitingOn, point = null, pid = process.pid }) {
  return ['--waiting-on', waitingOn, ...(point ? ['--point', String(point)] : []), '--pid', String(pid)]
}
export const manualDeclare = (opts) =>
  `node scripts/batch-in-flight.mjs ${waitArgs(opts).map((a, i) => (i === 1 ? quote(a) : a)).join(' ')}`
export const MANUAL_CLEAR = 'node scripts/batch-in-flight.mjs --clear'

const words = (e) => String(e?.stderr ?? '').trim().split('\n').filter(Boolean).at(-1) || (e?.code === 'ETIMEDOUT' ? `timed out after ${DECLARE_TIMEOUT_MS / 1000} s` : e?.message || String(e))

/**
 * Declare `waitingOn` before the wait starts. Returns the token `clearOwnWait`
 * needs; `declared: false` means nothing of ours stands. Never throws.
 */
export function declareOwnWait({
  waitingOn,
  point = null,
  pid = process.pid,
  exec = runInFlight,
  readDecl = readDeclaration,
  owner = runsForOwner,
  paused = () => existsSync(repoPath('.claude', 'batch-paused')),
  say = (line) => console.error(line),
} = {}) {
  const token = { declared: false, waitingOn }
  try {
    if (paused() || !owner()) return token
    const standing = readDecl()
    if (standing) {
      say(
        `in-flight: another wait is declared (${standing.waitingOn ?? 'unnamed'}) and is left as it is — ` +
          `declare this one by hand if it must hold the batch: ${manualDeclare({ waitingOn, point, pid })}`,
      )
      return token
    }
    exec(waitArgs({ waitingOn, point, pid }))
    return { ...token, declared: true }
  } catch (e) {
    say(`in-flight declaration FAILED: ${words(e)} — do it the old way: ${manualDeclare({ waitingOn, point, pid })}`)
    return token
  }
}

/** Clear the declaration `token` made — and only that one. Never throws. */
export function clearOwnWait(token, { exec = runInFlight, readDecl = readDeclaration, say = (line) => console.error(line) } = {}) {
  try {
    if (!token?.declared) return false
    const standing = readDecl()
    if (!standing || standing.waitingOn !== token.waitingOn) return false
    exec(['--clear'])
    return true
  } catch (e) {
    say(`in-flight clear FAILED: ${words(e)} — do it the old way: ${MANUAL_CLEAR}`)
    return false
  }
}
