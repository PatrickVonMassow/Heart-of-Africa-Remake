/**
 * Append-only, cross-process batch activity journal.
 *
 * A mkdir mutex serialises sequence allocation and append.  The sequence is
 * derived from the durable journal while holding that mutex; there is no side
 * counter that can advance without its line.  Each line is written and fsynced
 * before the mutex is released. Runtime callers use emitActivity(), which is
 * fail-open because telemetry must never stop ownership, handover, or a tool.
 */
import {
  appendFileSync,
  mkdirSync,
  openSync,
  closeSync,
  fsyncSync,
  readFileSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { activityRecord, parseActivityJournal } from './batch-activity-journal-core.mjs'

/** All linked worktrees write one machine journal in the main checkout. */
export function activityJournalPath({ repo = REPO_ROOT, exec = execFileSync } = {}) {
  try {
    const common = exec('git', ['-C', repo, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (common && /[/\\]\.git$/.test(common)) return join(dirname(common), '.claude', 'batch-activity.jsonl')
  } catch {
    /* a non-git fixture journals beside its explicit repository root */
  }
  return join(repo, '.claude', 'batch-activity.jsonl')
}

export const ACTIVITY_JOURNAL_PATH = activityJournalPath()
export const ACTIVITY_JOURNAL_LOCK_PATH = `${ACTIVITY_JOURNAL_PATH}.lock`
export const JOURNAL_LOCK_STALE_MS = 30_000
export const JOURNAL_LOCK_WAIT_MS = 2_000
const RETRY_MS = 5

const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function removeStaleLock(lockPath, now, staleMs) {
  try {
    if (now - statSync(lockPath).mtimeMs <= staleMs) return false
    rmSync(lockPath, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

function acquireJournalLock(lockPath, { now = Date.now, waitMs = JOURNAL_LOCK_WAIT_MS, staleMs = JOURNAL_LOCK_STALE_MS } = {}) {
  const deadline = now() + waitMs
  while (true) {
    try {
      mkdirSync(lockPath)
      return
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      removeStaleLock(lockPath, now(), staleMs)
      if (now() >= deadline) throw new Error(`timed out acquiring activity journal lock ${lockPath}`)
      wait(RETRY_MS)
    }
  }
}

function nextSequence(path) {
  try {
    const { records } = parseActivityJournal(readFileSync(path, 'utf8'))
    return (records.at(-1)?.seq ?? 0) + 1
  } catch (error) {
    if (error?.code === 'ENOENT') return 1
    throw error
  }
}

/** Append one transition and return the exact durable record. Throws so tests
 * and explicit callers can detect storage failure. Runtime lifecycle code uses
 * emitActivity below. */
export function appendActivity(input, {
  path = ACTIVITY_JOURNAL_PATH,
  lockPath = `${path}.lock`,
  now = Date.now,
  waitMs = JOURNAL_LOCK_WAIT_MS,
  staleMs = JOURNAL_LOCK_STALE_MS,
} = {}) {
  mkdirSync(dirname(path), { recursive: true })
  acquireJournalLock(lockPath, { now, waitMs, staleMs })
  try {
    const record = activityRecord({ ...input, at: input?.at ?? now(), seq: nextSequence(path) })
    const fd = openSync(path, 'a')
    try {
      writeSync(fd, `${JSON.stringify(record)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    return record
  } finally {
    rmSync(lockPath, { recursive: true, force: true })
  }
}

/** Best-effort lifecycle emission: observability never becomes a new wedge. */
export function emitActivity(input, options = {}) {
  try {
    return appendActivity(input, options)
  } catch {
    return false
  }
}

/** Kept injectable for the concurrency fixture; ordinary code never calls it. */
export function appendRawForTest(path, text) {
  appendFileSync(path, text)
}
