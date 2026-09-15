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
// scripts/wait-marker.mjs (duty (8) of scripts/lock-heartbeat-hook.mjs, which
// proves to the batch guard that a session is waiting rather than idling).
// Every read is failure-tolerant: an absent or unreadable record means "nothing
// known", never a false verdict.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tryWriteJsonAtomic } from '../atomic-write.mjs'
import { REPO_ROOT } from '../repo-paths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..', '..')

/** Where the frames land — the one directory every suite's shutter writes to. */
/** `HOA_FRAME_DIR` redirects it, on the same grounds as `HOA_WAIT_LEASE_PATH`:
 *  a fixture must be able to ask about frames without the live repository's
 *  own `verification/` answering for it. */
export const FRAME_DIR = process.env.HOA_FRAME_DIR || join(ROOT, 'verification')

/** A written frame, as opposed to the README that shares the directory. */
const FRAME_FILE = /\.(png|jpg|jpeg)$/i

/** The checkout whose RUNS this process is speaking about. The module's own
 *  location is the wrong answer for a fixture: a test that executes a script
 *  from this checkout with cwd and HOA_REPO_ROOT in a temporary repository
 *  would read the LIVE checkout's run records. That is how the attended
 *  context-ceiling hook found a running verification during its own unit run
 *  and swallowed the notice its test was asserting (measured 26.08.2026).
 *  Resolved once per process, so no hook pays a git call per invocation. */
const RUN_ROOT = REPO_ROOT || ROOT

/** The log directory the wrapper writes into (VERIFY_LOG_DIR overrides it). */
export function logDir(env = process.env) {
  return env.VERIFY_LOG_DIR ? join(RUN_ROOT, env.VERIFY_LOG_DIR) : join(RUN_ROOT, 'local', 'verify-logs')
}

/** The record sits beside its log and carries its name, so the two can never
 *  be paired up wrongly and a stale record is obvious at a glance. */
export function recordPathFor(logPath) {
  const full = isAbsolute(logPath) ? logPath : join(ROOT, logPath)
  return `${full}.run.json`
}

/** This process's OWN command line, recorded beside the pid as EVIDENCE of
 *  the writer's argv (point 700). The liveness probe's identity is the LOG
 *  PATH inside that argv — every wrapper launch carries one, the default
 *  launch by re-exec (run-logged.mjs); `commandNamesRun` in
 *  scripts/batch-in-flight.mjs matches the RECORDED path against the PROBED
 *  argv. A verbatim equality against this field stood there once and was an
 *  accepted break (Sol round 4): a recycled pid re-running the identical
 *  bare invocation compared equal. Read through the SAME LENS the probe
 *  uses (`processCommandOf`: /proc cmdline joined with single spaces; CIM
 *  CommandLine on Windows) so the recorded evidence stays comparable with a
 *  live probe — change the two together (a static import either way is
 *  ruled out there). Null when unreadable; the identity does not depend on
 *  it. */
export function selfCommandLine() {
  if (process.platform !== 'win32') {
    try {
      const raw = readFileSync('/proc/self/cmdline', 'utf8')
      return raw.split('\0').filter(Boolean).join(' ').trim() || null
    } catch {
      return null
    }
  }
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${process.pid}").CommandLine`],
      { windowsHide: true, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return out || null
  } catch {
    return null
  }
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
export function latestRecordPath(dir = logDir(), { max = SCAN_LIMIT } = {}) {
  let best = null
  for (const { path, record } of scanRecords(dir, max)) {
    const at = Number(record?.startedAt)
    if (!Number.isFinite(at)) continue
    if (!best || at > best.at) best = { path, at }
  }
  return best?.path ?? null
}

/**
 * How many record files a scan reads. Records are never pruned, so an unbounded
 * scan would grow the cost of a hook that runs on EVERY tool call without limit.
 * The filenames start with an ISO stamp, so a descending sort is chronological
 * and the newest few are always the interesting ones.
 */
export const SCAN_LIMIT = 20

/** The newest `max` records, newest filename first, each already parsed. */
function scanRecords(dir, max = SCAN_LIMIT) {
  let names = []
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.run.json')).sort().reverse().slice(0, max)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const path = join(dir, name)
    const record = readRecord(path)
    if (record) out.push({ path, record })
  }
  return out
}

/**
 * THE RUN A WAIT IS ABOUT: the newest one still GOING, and only failing that the
 * newest one at all.
 *
 * "Newest" alone was wrong (four-eyes finding 2): a quick single-suite verify
 * that starts and finishes while a background LARGE still runs becomes the
 * newest record, and a caller judging liveness on it would call the LARGE over —
 * withdrawing the wait marker in the middle of the very wait it exists for.
 */
export function activeRecordPath(dir = logDir(), { max = SCAN_LIMIT } = {}) {
  let live = null
  let any = null
  for (const { path, record } of scanRecords(dir, max)) {
    const at = Number(record?.startedAt)
    if (!Number.isFinite(at)) continue
    if (!any || at > any.at) any = { path, at }
    if (runIsLive(record).live && (!live || at > live.at)) live = { path, at }
  }
  return (live ?? any)?.path ?? null
}

/**
 * EVERY run record that is still going (point 1048, union entry U13).
 *
 * `activeRecordPath` answers "the newest live one", which is the right answer
 * for a status glance and the wrong one for an automated wait: a quick suite
 * started beside a running LARGE makes the resolution AMBIGUOUS, and a wait
 * that silently picks one of two runs cannot be told from a wait on a stale
 * record. A caller that finds more than one entry here must name its run.
 */
export function liveRecordPaths(dir = logDir(), { max = SCAN_LIMIT } = {}) {
  const live = []
  for (const { path, record } of scanRecords(dir, max)) {
    if (!Number.isFinite(Number(record?.startedAt))) continue
    if (runIsLive(record).live) live.push({ path, record })
  }
  return live.sort((a, b) => Number(b.record.startedAt) - Number(a.record.startedAt))
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

/** The newest mtime among the frame files, or null when the directory cannot be
 *  read. The render suites write frames THROUGHOUT their run, so this is the one
 *  heartbeat a suite emits before it ends — `run-all.mjs` captures a suite's
 *  output and prints its result line only once the suite is over. */
export function newestFrameMtimeMs({ dir = FRAME_DIR, since = null } = {}) {
  let names = []
  try {
    names = readdirSync(dir).filter((n) => FRAME_FILE.test(n))
  } catch {
    return null
  }
  // A frame OLDER than the run is a frame the run did not take: counting it
  // would let yesterday's pictures vouch for today's wedge.
  const floor = typeof since === 'number' && Number.isFinite(since) ? since : -Infinity
  let newest = null
  for (const name of names) {
    try {
      const { mtimeMs } = statSync(join(dir, name))
      if (mtimeMs < floor) continue
      if (newest === null || mtimeMs > newest) newest = mtimeMs
    } catch {
      /* a file that vanished mid-scan says nothing about progress */
    }
  }
  return newest
}

/**
 * WHEN DID THIS RUN LAST SHOW A SIGN OF LIFE (point 1137)?
 *
 * The newest of three marks, because no single one covers a whole run: the LOG
 * grows at every stage and suite boundary, the RECORD is rewritten when the run
 * starts and ends, and the FRAMES advance inside a long render suite, which is
 * the stretch the log cannot see. Anything unreadable is left out rather than
 * counted as silence — a probe that cannot see is not evidence of a wedge.
 *
 * Returns null when nothing could be read at all, which callers treat as
 * "nobody looked" and not as "nothing happened".
 */
export function lastProgressAtFor({ logPath = null, recordPath = null, markPath = undefined } = {}) {
  // ONLY WHAT THE RUN ITSELF WROTE COUNTS — the LATEST of it (Astra review
  // rounds 1 to 3). Three rules, each paid for by a finding:
  //
  // NOTHING A READER WRITES IS EVIDENCE. `countPoll` rewrites the run RECORD, so
  // taking that file's mtime let a reader manufacture the life it was looking
  // for: poll a wedged run often enough and it never reports hung. The record is
  // therefore not consulted here at all, and `recordPath` serves only to derive
  // the mark's name when no log path was given.
  //
  // THE MARK IS A FILE OF ITS OWN. Kept as a field inside the record it would
  // share a read-modify-write with that same poll, and a poll that read the
  // record, was overtaken by the writer and wrote its stale copy back would
  // silently DROP a fresh mark.
  //
  // AND IT IS A MAXIMUM, NOT A PREFERENCE. A mark that stops being writable
  // freezes at its last value; preferring it blindly would then let a stale file
  // outvote a log that is still moving, and condemn a healthy run after one
  // lease. Both sources below belong to ONE run — the wrapper stamps the mark
  // and appends the log — so the newest of them is that run's last sign of life.
  //
  // THE FRAMES ARE NOT AMONG THEM, AND THAT IS THE POINT (Astra review round 4).
  // `verification/` is shared and carries no run identity, so a reader that
  // folded it in could have any other run's pictures vouch for the one it is
  // judging — for ever, and for a selection that takes no frames at all. The
  // frames are read by the WRITER instead, about its own run, while it is the
  // run that is going; see the sampler in run-logged.mjs for what still bounds
  // that. Here, nothing that another run could have written is evidence.
  const marks = []
  const mark = markPath === undefined ? progressMarkPathFor(logPath ?? recordPath) : markPath
  for (const path of [mark, logPath]) {
    if (typeof path !== 'string' || path.trim() === '') continue
    try {
      marks.push(statSync(resolveIn(path)).mtimeMs)
    } catch {
      /* an absent mark or log is not a progress mark */
    }
  }
  return marks.length > 0 ? Math.max(...marks) : null
}

const resolveIn = (path) => (isAbsolute(path) ? path : join(ROOT, path))

/** The writer's progress mark, beside the log it belongs to. A zero-byte file
 *  whose MTIME is the whole message: one writer, one write, no read-modify-write,
 *  and therefore nothing a concurrent reader can lose. */
export function progressMarkPathFor(logPath) {
  if (typeof logPath !== 'string' || logPath.trim() === '') return null
  return `${logPath.replace(/\.run\.json$/, '')}.progress`
}

/** Stamp the mark. Only run-logged.mjs calls this, and a failure is silent: a
 *  run must never die because it could not say it was alive. */
export function touchProgressMark(logPath) {
  const path = progressMarkPathFor(logPath)
  if (!path) return false
  try {
    writeFileSync(resolveIn(path), '')
    return true
  } catch {
    return false
  }
}
