// Cross-process serialization for the board's read-modify-write commands.
//
// `writeTextAtomic` prevents torn bytes, but it cannot make this sequence atomic:
// read board A -> derive board B -> replace A with B. Two board.mjs processes can
// both derive from A and the later replace then silently discards the first edit.
// The launcher is an unattended board writer now, so call-site discipline can no
// longer prevent that race.
//
// Reuse the repository's proven singleton rather than inventing a second stale-
// owner protocol. Its exclusive create is the acquisition point, its reaper
// verifies the recorded process before takeover, and its session-id check makes
// release owner-safe. This lock has its OWN path and fence: it must never alter
// the batch owner's lock family.
import { randomUUID } from 'node:crypto'
import {
  acquire,
  processStartTime,
  release,
} from './batch-singleton.mjs'
import { sleepSync } from './atomic-write.mjs'
import { repoPath } from './repo-paths.mjs'

export const BOARD_EDIT_LOCK_PATH = repoPath('.claude/board-edit-lock.json')
export const BOARD_EDIT_LOCK_WAIT_MS = 3 * 60 * 1000
export const BOARD_EDIT_LOCK_POLL_MS = 100
// A board edit normally finishes in seconds. The long lease is deliberate: if
// publishing ever hangs, a living writer remains authoritative instead of a
// clock permitting a second writer into the same read-modify-write.
export const BOARD_EDIT_LOCK_LEASE_MS = 24 * 60 * 60 * 1000

/**
 * Run one synchronous board transaction under an exclusive cross-process lock.
 * A contender waits; a dead holder is reaped by the shared singleton protocol.
 * A wait timeout throws before `work` starts, so it can delay an update but can
 * never turn contention into a lost update.
 */
export function withBoardEditLock(work, opts = {}) {
  if (typeof work !== 'function') throw new TypeError('withBoardEditLock needs a synchronous function')
  const lockPath = opts.lockPath ?? BOARD_EDIT_LOCK_PATH
  const fencePath = opts.fencePath ?? `${lockPath}.fence`
  const waitMs = opts.waitMs ?? BOARD_EDIT_LOCK_WAIT_MS
  const pollMs = opts.pollMs ?? BOARD_EDIT_LOCK_POLL_MS
  const leaseMs = opts.leaseMs ?? BOARD_EDIT_LOCK_LEASE_MS
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? sleepSync
  const acquireFn = opts.acquireFn ?? acquire
  const releaseFn = opts.releaseFn ?? release
  const pid = opts.pid ?? process.pid
  const pidStartedAt = opts.pidStartedAt ?? processStartTime(pid)
  const ownerId = opts.ownerId ?? `board-edit-${pid}-${randomUUID()}`
  const startedAt = now()

  for (;;) {
    const verdict = acquireFn(ownerId, {
      lockPath,
      fencePath,
      kind: 'board-edit',
      pid,
      pidStartedAt,
      now: now(),
      leaseMs,
      // A board edit is one declared transaction. Unlike a Claude session, its
      // recorded pid belongs to exactly this short-lived Node process; keeping
      // the declaration set prevents the batch singleton's five-minute idle-
      // session rule from dispossessing a still-running publish. A dead process
      // remains reapable by the pid branch once the fresh-lock grace has passed.
      work: { declared: true },
      probePidFn: opts.probePidFn,
    })
    if (verdict === 'acquired' || verdict === 'mine') break
    const elapsed = now() - startedAt
    if (elapsed >= waitMs) {
      throw new Error(`board edit lock stayed held for ${Math.round(elapsed)} ms; no board update was attempted`)
    }
    sleep(Math.min(pollMs, waitMs - elapsed))
  }

  try {
    const result = work()
    if (result && typeof result.then === 'function') {
      throw new TypeError('withBoardEditLock work must be synchronous')
    }
    return result
  } finally {
    releaseFn(ownerId, lockPath)
  }
}
