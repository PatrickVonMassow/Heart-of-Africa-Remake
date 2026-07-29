// Atomic JSON writes that survive a Windows moment (point 388, first live
// finding 28.07.2026).
//
// WHY: `.claude/boundary.log` recorded
//   FAIL-OPEN: the guard errored and allowed the stop
//   (EPERM: operation not permitted, rename batch-lock.json.tmp-9904 -> batch-lock.json)
// The write-to-temp + rename that makes a lock update atomic is not atomic
// against an antivirus scanner or the search indexer holding the TARGET file
// open for a few milliseconds — Windows answers EPERM or EBUSY, and on that path
// the guard failed open, which is right for a guard but meant the HANDOVER was
// silently not written. A handover that reports success while the lock keeps its
// old content is the failure of that night in a new costume.
//
// So the write RETRIES briefly, and the caller can ask whether it worked
// (`tryWriteJsonAtomic`) instead of only whether it threw. Pure decision parts
// (`isTransientWriteError`, the delay ladder) are dependency-injected and
// Vitest-covered in scripts/atomic-write.test.mjs.
import { writeFileSync, renameSync, rmSync } from 'node:fs'

/** Error codes that mean "someone is holding the file right now" rather than
 *  "this write can never succeed". ENOSPC, EROFS or EISDIR are NOT here: a
 *  retry would only burn time and hide a real fault. */
export const TRANSIENT_WRITE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'EAGAIN', 'ETXTBSY'])

/** The backoff ladder — four retries inside ~0.8 s. Short on purpose: this runs
 *  inside hooks that gate a turn end, and the interference it works around is a
 *  scanner touching a file, measured in milliseconds. */
export const WRITE_RETRY_DELAYS_MS = [25, 75, 200, 500]

export function isTransientWriteError(err) {
  return !!err && TRANSIENT_WRITE_CODES.has(String(err.code ?? ''))
}

/** Block the thread for `ms` without a timer — these callers are synchronous
 *  hooks, and there is no event loop turn to yield to. */
export function sleepSync(ms) {
  if (!(ms > 0)) return
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Write `obj` as pretty JSON to `path` atomically, retrying a transient failure.
 * Throws the LAST error when every attempt failed (so existing callers keep
 * their behaviour). Options are injectable for the tests:
 *   { delays, sleep, write, rename, remove, pid }
 * Returns { ok: true, attempts }.
 */
export function writeJsonAtomic(path, obj, opts = {}) {
  const {
    delays = WRITE_RETRY_DELAYS_MS,
    sleep = sleepSync,
    write = writeFileSync,
    rename = renameSync,
    remove = rmSync,
    pid = process.pid,
  } = opts
  const text = JSON.stringify(obj, null, 2)
  let last = null
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    // A FRESH temp name per attempt: the previous one may be exactly the file
    // the scanner is still holding, and reusing it would retry into the same
    // block every time.
    const tmp = `${path}.tmp-${pid}-${attempt}`
    try {
      write(tmp, text)
      rename(tmp, path)
      return { ok: true, attempts: attempt + 1 }
    } catch (e) {
      last = e
      try {
        remove(tmp, { force: true })
      } catch {
        /* the leftover is harmless — a distinct name is used next time */
      }
      if (!isTransientWriteError(e) || attempt === delays.length) break
      sleep(delays[attempt])
    }
  }
  throw last
}

/**
 * The same write, REPORTING instead of throwing: { ok, attempts, error }. The
 * caller that must tell the session "the stop may proceed but the handover did
 * NOT happen" needs the failure as data, not as an exception it swallows.
 */
export function tryWriteJsonAtomic(path, obj, opts = {}) {
  try {
    return { ...writeJsonAtomic(path, obj, opts), error: null }
  } catch (e) {
    return { ok: false, attempts: (opts.delays ?? WRITE_RETRY_DELAYS_MS).length + 1, error: e }
  }
}
