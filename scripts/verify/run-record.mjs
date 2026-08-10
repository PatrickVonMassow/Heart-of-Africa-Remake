// THE RUN AS ONE CHECKABLE OBJECT (point 592) — the IO half.
//
// A verify run used to exist only as a growing log file and a live process, so
// the only way to learn anything about it was to read the log again. That is
// what a poll IS. The record below is the alternative: one small JSON file
// beside the log that says what the run covers, what it is expected to cost,
// whether it is still going, how often anybody looked, and — once it is over —
// its whole completion receipt.
//
// It is written by scripts/verify/run-logged.mjs (the wrapper owns the run) and
// read by scripts/verify/run-wait.mjs (the caller awaits it) and by
// scripts/wait-marker-hook.mjs (the hook that proves to the batch guard that a
// session is waiting rather than idling). Every read is failure-tolerant: an
// absent or unreadable record means "nothing known", never a false verdict.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tryWriteJsonAtomic } from '../atomic-write.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..', '..')

/** Where the frames land — the one directory every suite's shutter writes to. */
export const FRAME_DIR = join(ROOT, 'verification')

/** A written frame, as opposed to the README that shares the directory. */
const FRAME_FILE = /\.(png|jpg|jpeg)$/i

/** The log directory the wrapper writes into (VERIFY_LOG_DIR overrides it). */
export function logDir(env = process.env) {
  return env.VERIFY_LOG_DIR ? join(ROOT, env.VERIFY_LOG_DIR) : join(ROOT, 'local', 'verify-logs')
}

/** The record sits beside its log and carries its name, so the two can never
 *  be paired up wrongly and a stale record is obvious at a glance. */
export function recordPathFor(logPath) {
  const full = isAbsolute(logPath) ? logPath : join(ROOT, logPath)
  return `${full}.run.json`
}

export function readRecord(path) {
  try {
    const r = JSON.parse(readFileSync(path, 'utf8'))
    return r && typeof r === 'object' ? r : null
  } catch {
    return null
  }
}

/** Best effort by design: a run must never die over its own bookkeeping. */
export function writeRecord(path, record) {
  try {
    mkdirSync(dirname(path), { recursive: true })
  } catch {
    /* the write below reports it */
  }
  return tryWriteJsonAtomic(path, record).ok
}

/**
 * The NEWEST run record, by the start time it carries (not by mtime — a poll
 * rewrites the file). This is what `run-wait.mjs` resolves when no log is
 * named, which is the ordinary case: the session has just started one run.
 */
export function latestRecordPath(dir = logDir()) {
  let names = []
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.run.json'))
  } catch {
    return null
  }
  let best = null
  for (const name of names) {
    const path = join(dir, name)
    const record = readRecord(path)
    const at = Number(record?.startedAt)
    if (!Number.isFinite(at)) continue
    if (!best || at > best.at) best = { path, at }
  }
  return best?.path ?? null
}

/**
 * HOW MANY DISTINCT FRAMES DID THIS RUN WRITE? By mtime against the run's start,
 * because the frames themselves carry no run identity — and DISTINCT, because a
 * both-backends run photographs the same names twice and counting writes would
 * demand 182 files where 93 exist. A tolerance absorbs a filesystem whose mtime
 * resolution is coarser than the moment the run began.
 */
export function framesWrittenSince(startedAt, { dir = FRAME_DIR, toleranceMs = 2000 } = {}) {
  // `typeof`, not `Number(…)`: `Number(null)` is 0, which would silently turn
  // "nobody said when the run began" into "count every frame ever taken".
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null
  const since = startedAt
  let names = []
  try {
    names = readdirSync(dir).filter((n) => FRAME_FILE.test(n))
  } catch {
    return null
  }
  const written = new Set()
  for (const name of names) {
    try {
      if (statSync(join(dir, name)).mtimeMs >= since - toleranceMs) written.add(name)
    } catch {
      /* a file that vanished mid-scan was not written by this run */
    }
  }
  return written.size
}

/** The commit the run ran on, and the branch it sat on — the receipt's anchor.
 *  Any git failure answers nulls; a receipt that invented a HEAD would be worse
 *  than one that admits it does not know which code was tested. */
export function gitPosition({ cwd = ROOT } = {}) {
  const git = (args) => {
    try {
      return execFileSync('git', args, {
        windowsHide: true,
        cwd,
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return null
    }
  }
  const head = git(['rev-parse', '--short', 'HEAD'])
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  return { head: head || null, branch: branch && branch !== 'HEAD' ? branch : null }
}

/** Is the process that owns this record still alive? `null` when the record
 *  names no pid — unknown is not the same as dead. */
export function pidAlive(pid) {
  const n = Number(pid)
  if (!Number.isFinite(n) || n <= 0) return null
  try {
    process.kill(n, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

/**
 * Is this record's run STILL GOING? The record's own status first (the wrapper
 * stamps it at the close), corroborated by the process: a wrapper killed before
 * it could stamp leaves `running` behind for ever, and a batch guard riding on
 * that would be exactly the blind guard this must not become.
 */
export function runIsLive(record) {
  if (!record || typeof record !== 'object') return { live: false, reason: 'no-record' }
  if (record.status !== 'running') return { live: false, reason: `status:${record.status ?? 'unknown'}` }
  const alive = pidAlive(record.pid)
  if (alive === false) return { live: false, reason: 'pid-gone' }
  return { live: true, reason: alive === null ? 'status-running' : 'pid-alive' }
}

/** How long the run has been going, in ms, or null when it never said. */
export function elapsedMs(record, now = Date.now()) {
  const at = Number(record?.startedAt)
  return Number.isFinite(at) ? Math.max(0, now - at) : null
}

/**
 * COUNT ONE POLL. Returns the record as it now stands (with the raised count),
 * or null when there is nothing to count against. Deliberately the ONLY way the
 * counter moves, so the number in the receipt means "somebody looked while it
 * was running" and nothing else.
 */
export function countPoll(path) {
  const record = readRecord(path)
  if (!record) return null
  const polls = (Number.isFinite(record.polls) ? record.polls : 0) + 1
  const next = { ...record, polls, lastPolledAt: Date.now() }
  writeRecord(path, next)
  return next
}

/** Does this checkout have a frame directory at all (a worktree may not)? */
export function frameDirExists() {
  return existsSync(FRAME_DIR)
}
