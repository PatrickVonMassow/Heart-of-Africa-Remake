// THE SPOOL AS A DIRECTORY — one file per message, and why it is not one file.
//
// Stage 1 appended every accepted message to `.claude/chat-spool.jsonl`. That
// shape works while the ONLY consumer is the launcher, which reads the whole
// file once a quarter of an hour. It does not survive stage 2: the per-tool-call
// delivery reads the spool several times a second and must REMOVE what it has
// just shown, or the same message is injected into the context on every tool
// call — a token leak at exactly the rate the delivery rule exists to prevent.
//
// Removing one line from a shared append-only file means read → slice → rewrite,
// which races the poller's append and is not atomic on this platform anyway:
// `.claude/boundary.log` recorded a real `EPERM … rename` from a scanner holding
// the target file open (see scripts/atomic-write.mjs), and a per-tool-call reader
// is precisely the scanner-shaped load that produced it.
//
// So a message is a FILE. The poller creates `.claude/chat-spool/<id>.json`
// atomically (tmp + rename, with the retry ladder); the consumer RENAMES it into
// `.claude/chat-spool/consumed/` before it shows it. Rename is the operation the
// filesystem gives us for free: exactly one caller can move a given file, so two
// consumers can never deliver the same message, and a crash between the rename
// and the delivery loses at most that one message instead of duplicating it
// forever. Creation and consumption never touch the same bytes.
//
// THE CONSUMED FILES ARE NOT RUBBISH. The replay ledger is seeded FROM the spool
// (see `seededLedger` in scripts/chat-inbox.mjs): a message that vanished with no
// trace could be re-accepted by the next poll for as long as ntfy keeps it — 12
// hours. Consumed messages therefore stay readable and are pruned only well past
// that window (`CONSUMED_RETENTION_MS`).
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { repoPath } from './repo-paths.mjs'
import { WRITE_RETRY_DELAYS_MS, isTransientWriteError, sleepSync, writeJsonAtomic } from './atomic-write.mjs'
import { MAX_PER_CALL, deliveryDecision, hookStdout, orderMessages, parseSpoolFile, spoolFileName } from './chat-delivery-core.mjs'

export const SPOOL_DIR = repoPath('.claude', 'chat-spool')

/** The stage-1 spool. Read once, migrated, then kept as `.migrated-<ts>` — the
 *  user's words are never deleted by a format change. */
export const LEGACY_SPOOL_PATH = repoPath('.claude', 'chat-spool.jsonl')

/** Long past ntfy's 12-hour cache, so a consumed message is still in the ledger
 *  for every moment in which the transport could still replay it. */
export const CONSUMED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export const consumedDir = (dir = SPOOL_DIR) => join(dir, 'consumed')

const ensureDir = (dir) => {
  mkdirSync(dir, { recursive: true })
  return dir
}

/** A rename that survives the same Windows moment `writeJsonAtomic` survives:
 *  a scanner holding either name open answers EPERM/EBUSY for a few ms. */
export function renameWithRetry(from, to, opts = {}) {
  const { delays = WRITE_RETRY_DELAYS_MS, sleep = sleepSync, rename = renameSync } = opts
  let last = null
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      rename(from, to)
      return { ok: true, attempts: attempt + 1, error: null }
    } catch (e) {
      last = e
      if (!isTransientWriteError(e) || attempt === delays.length) break
      sleep(delays[attempt])
    }
  }
  return { ok: false, attempts: delays.length + 1, error: last }
}

const jsonFiles = (dir) => {
  try {
    // `.tmp-<pid>-<n>` files are half-written by definition; they do not end in
    // `.json`, so the same filter that picks messages excludes them.
    return readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
}

function readDirMessages(dir) {
  const out = []
  for (const file of jsonFiles(dir)) {
    let msg = null
    try {
      msg = parseSpoolFile(readFileSync(join(dir, file), 'utf8'))
    } catch {
      /* unreadable right now — the next read sees it */
    }
    if (msg) out.push({ ...msg, file })
  }
  return orderMessages(out)
}

/** Everything waiting for a consumer, oldest first. TOTAL — a torn or missing
 *  file is skipped, never thrown. */
export const readPending = (dir = SPOOL_DIR) => readDirMessages(dir)

/** Everything already delivered and still inside the ledger window. */
export const readConsumed = (dir = SPOOL_DIR) => readDirMessages(consumedDir(dir))

/** What the replay ledger must know about: delivered messages count exactly as
 *  much as waiting ones — both were accepted once and may never be twice. */
export const knownMessages = (dir = SPOOL_DIR) => [...readConsumed(dir), ...readPending(dir)]

/** Is this message already on the spool, waiting or consumed? */
export function isSpooled(message, dir = SPOOL_DIR) {
  const name = spoolFileName(message)
  if (!name) return false
  return existsSync(join(dir, name)) || existsSync(join(consumedDir(dir), name))
}

/**
 * Write one accepted message as its own file. Idempotent: a message already
 * waiting or already consumed is NOT written again, so a re-poll of the same
 * ntfy cache cannot resurrect something the session has read.
 * Returns { ok, file, reason }.
 */
export function spoolMessage(message, dir = SPOOL_DIR, opts = {}) {
  const name = spoolFileName(message)
  if (!name) return { ok: false, file: null, reason: 'unusable-id' }
  if (isSpooled(message, dir)) return { ok: false, file: name, reason: 'already-spooled' }
  try {
    ensureDir(dir)
    writeJsonAtomic(join(dir, name), message, opts)
    return { ok: true, file: name, reason: null }
  } catch (e) {
    return { ok: false, file: name, reason: (e && e.message) || 'write failed' }
  }
}

/**
 * TAKE a waiting message: move it into `consumed/` and hand it back. The rename
 * is the claim — a message this returns has been removed from the pending set,
 * so no second reader can deliver it. Returns null when the file was already
 * gone (another consumer won) or could not be moved.
 */
export function claimMessage(file, dir = SPOOL_DIR, opts = {}) {
  const from = join(dir, file)
  let message = null
  try {
    message = parseSpoolFile(readFileSync(from, 'utf8'))
  } catch {
    return null
  }
  if (!message) return null
  try {
    ensureDir(consumedDir(dir))
  } catch {
    return null
  }
  const moved = renameWithRetry(from, join(consumedDir(dir), file), opts)
  return moved.ok ? { ...message, file } : null
}

/** Claim the oldest `n` waiting messages (the `--ack` path). */
export function claimOldest(n, dir = SPOOL_DIR, opts = {}) {
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  const taken = []
  for (const m of readPending(dir).slice(0, count)) {
    const claimed = claimMessage(m.file, dir, opts)
    if (claimed) taken.push(claimed)
  }
  return taken
}

/**
 * THE PER-TOOL-CALL HOOK'S WHOLE DUTY, in one call. Returns what the hook must
 * write to stdout — and `''` MEANS IT WRITES NOTHING AT ALL, not an empty line:
 * injected context is re-sent with every later request, so an empty spool must
 * cost zero tokens (see chat-delivery-core.mjs, the token rule).
 *
 * The message is CLAIMED BEFORE IT IS EMITTED. Emitting first and claiming after
 * would re-inject the same message on every tool call for as long as the claim
 * kept failing — the leak this rule exists to prevent — so only what the rename
 * actually moved is rendered.
 *
 * FAIL-OPEN AND SILENT, always: this runs inside a hook on EVERY tool call, and
 * no fault of the chat channel may ever break a tool call or print noise into a
 * session's context.
 */
export function deliverPendingMessages({ dir = SPOOL_DIR, ownsBatch = false, paused = false, max = MAX_PER_CALL } = {}) {
  try {
    // The two stand-downs first, so a non-owner and a paused batch cost one
    // boolean rather than a directory read.
    if (!ownsBatch || paused) return ''
    if (!existsSync(dir)) return ''
    const plan = deliveryDecision({ ownsBatch, paused, pending: readPending(dir), max })
    const claimed = []
    for (const m of plan.deliver) {
      const taken = claimMessage(m.file, dir)
      if (taken) claimed.push(taken)
    }
    return hookStdout(claimed)
  } catch {
    return ''
  }
}

/** Parse a stage-1 JSONL spool. TOTAL — a torn line is skipped, oldest first. */
export function readLegacyJsonl(path = LEGACY_SPOOL_PATH) {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .map((l) => parseSpoolFile(l))
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * THE ONE-TIME MIGRATION off the stage-1 JSONL spool.
 *
 * Every line becomes a WAITING message file, not a consumed one: the launcher
 * decides for itself what a spawn still needs (`pendingSinceHandover`, keyed on
 * `receivedAt`), so a message it already carried into a prompt is filtered there
 * as before, while one that never reached anybody is still delivered. Losing the
 * user's words to a storage change would be the worse failure of the two.
 *
 * The old file is then RENAMED aside (`.migrated-<ts>`), never deleted, and
 * every step is idempotent: a message whose file already exists is skipped, so a
 * migration interrupted halfway simply finishes on the next tick.
 */
export function migrateLegacySpool({ legacyPath = LEGACY_SPOOL_PATH, dir = SPOOL_DIR, now = Date.now() } = {}) {
  if (!existsSync(legacyPath)) return { migrated: 0, skipped: 0, archived: false }
  let migrated = 0
  let skipped = 0
  for (const message of readLegacyJsonl(legacyPath)) {
    const r = spoolMessage(message, dir)
    if (r.ok) migrated++
    else skipped++
  }
  const archived = renameWithRetry(legacyPath, `${legacyPath}.migrated-${now}`).ok
  return { migrated, skipped, archived }
}

/** Drop consumed messages that no transport can replay any more. Bounds the
 *  directory without ever shortening the replay ledger inside its window. */
export function pruneConsumed(dir = SPOOL_DIR, { now = Date.now(), retentionMs = CONSUMED_RETENTION_MS } = {}) {
  const cdir = consumedDir(dir)
  let removed = 0
  for (const file of jsonFiles(cdir)) {
    const p = join(cdir, file)
    try {
      if (now - statSync(p).mtimeMs <= retentionMs) continue
      rmSync(p, { force: true })
      removed++
    } catch {
      /* a file we cannot stat or remove stays — it costs one entry */
    }
  }
  return { removed }
}
