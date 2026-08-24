// THE DURABLE STATE STORE'S I/O — step 2 of the "Ordered work" in
// docs/handover-architecture.md (work-order point 892, the front stage of 676).
//
// Thin by design: every decision lives in scripts/batch-state-core.mjs and
// scripts/batch-schema-core.mjs; this file only moves bytes, and it moves them
// with the durability the union requires — an fsynced append for every journal
// entry, WRITE–FLUSH–RENAME for every committed snapshot or receipt, and a
// directory fsync after the rename so the new name itself survives a crash.
//
// THE STATE PATHS ARE RESTRICTED (architecture, "Additional omissions"): the
// store lives under the git COMMON directory — shared by every worktree,
// inside no worktree's checkout — is created owner-only (0o700), and a store
// path that is a symlink is REFUSED rather than followed: a link planted at the
// store's name would otherwise redirect fsynced writes anywhere the planter
// chose. Restricted-file reads enforce O_NOFOLLOW on the open itself, so a path
// swapped after an lstat check is refused rather than followed.
//
// STILL DARK: nothing on today's authoring path imports this file; its first
// runtime caller is the daemon of step 3, and the activation flag refuses to
// enable while steps 8 and 9 are not green.
import { closeSync, constants as fsConstants, existsSync, fstatSync, fsyncSync, ftruncateSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { SCHEMA_VERSION, frameEntry } from './batch-schema-core.mjs'
import { readSnapshotText, replayJournal, sealSnapshotText } from './batch-state-core.mjs'

/** The one directory family the store may live in. Resolved from the repository
 *  so every worktree of it reaches the SAME store — that is what makes the record
 *  survive the session and the worktree that wrote it. */
export function stateRootFor(repoDir) {
  const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { windowsHide: true, cwd: repoDir, encoding: 'utf8' }).trim()
  return join(resolve(repoDir, commonDir), 'codex-batches')
}

/** A batch id becomes a directory name, so it must not be able to leave the root:
 *  one path segment, no separators, no dot-dot, nothing hidden. */
export function validBatchId(batchId) {
  return typeof batchId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(batchId) && !batchId.includes('..')
}

function refuseSymlink(path, what) {
  // lstat DIRECTLY: existsSync follows symlinks and answers false for a
  // DANGLING one, which would wave exactly the planted link through that the
  // 'a'-open would then create a target for, outside the store.
  let stat
  try {
    stat = lstatSync(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return // absent is fine; guarded opens decide creation
    throw new Error(`${what} cannot be inspected and is refused: ${path}: ${error.message}`, { cause: error })
  }
  if (stat.isSymbolicLink()) throw new Error(`${what} is a symlink and is refused: ${path}`)
}

/** Test seam for the durability boundary: fsync cannot be observed from
 *  outside the process, so the test records which directories were flushed
 *  through this hook. Production leaves it null. */
export const durabilityProbe = { onDirFsync: null }

/** A new NAME is durable only once its directory is flushed: an fsynced file
 *  can still vanish with its filename after a crash if the directory entry
 *  never reached the disk. Called for every created directory and for the
 *  journal's own creation. */
function fsyncDir(path) {
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  durabilityProbe.onDirFsync?.(path)
}

function assertInside(root, path) {
  const resolved = resolve(path)
  if (resolved !== resolve(root) && !resolved.startsWith(resolve(root) + sep)) {
    throw new Error(`state path escapes the store root: ${path}`)
  }
}

/** Opens (creating if needed) the store for one batch and returns its paths. Every
 *  directory on the way is owner-only and symlink-refused; a store that exists with
 *  looser modes is reported rather than silently tightened, because a mode someone
 *  widened is evidence, not noise. */
export function openStateStore({ repoDir = process.cwd(), batchId } = {}) {
  if (!validBatchId(batchId)) throw new Error(`not a usable batch id: ${JSON.stringify(batchId)}`)
  const root = stateRootFor(repoDir)
  const dir = join(root, batchId)
  assertInside(root, dir)
  for (const p of [root, dir]) {
    refuseSymlink(p, 'a state directory')
    if (!existsSync(p)) {
      mkdirSync(p, { recursive: true, mode: 0o700 })
      fsyncDir(dirname(p))
    }
  }
  const receiptsDir = join(dir, 'receipts')
  refuseSymlink(receiptsDir, 'the receipts directory')
  if (!existsSync(receiptsDir)) {
    mkdirSync(receiptsDir, { recursive: true, mode: 0o700 })
    fsyncDir(dir)
  }
  const store = {
    batchId,
    dir,
    journalPath: join(dir, 'events.jsonl'),
    snapshotPath: join(dir, 'snapshot.json'),
    daemonRecordPath: join(dir, 'daemon.json'),
    // THE LANE'S OWN FENCE STORE, deliberately NOT `.claude/batch-fence.json`.
    // That file belongs to the batch singleton, whose only writer rebuilds it
    // from a fixed field set on every acquisition — so a `generation` written
    // there is erased by the next acquire, and the daemon that needs it can
    // never start again (measured 24.08.2026, cross-vendor review of point 834:
    // the drill only passed because it hand-seeded the file and never let a real
    // acquisition touch it). The number is seeded FROM the lock; the generation
    // lives where nothing else writes.
    fenceStorePath: join(dir, 'fence.json'),
    receiptsDir,
  }
  const loose = []
  for (const p of [dir, receiptsDir]) {
    const mode = statSync(p).mode & 0o777
    if (mode & 0o077) loose.push({ path: p, mode: mode.toString(8) })
  }
  return { ...store, looseModes: loose }
}

/** Writes ALL of `text` through `fd` or throws: writeSync's return value is a
 *  byte count, and a short write acknowledged as complete would let a partial
 *  journal frame count as durable or an incomplete snapshot be renamed over
 *  the last good one. The loop finishes the write; a count that stops
 *  advancing is an error, never a success. */
function writeAllSync(fd, text) {
  const buf = Buffer.isBuffer(text) ? text : Buffer.from(text)
  let written = 0
  while (written < buf.length) {
    const n = writeSync(fd, buf, written, buf.length - written)
    if (!Number.isInteger(n) || n <= 0) throw new Error(`short write: ${written} of ${buf.length} bytes reached the file`)
    written += n
  }
  return buf.length
}

/** Read through the descriptor that performed O_NOFOLLOW. Passing the path to
 *  readFileSync after an lstat check would reopen it and leave a substitution
 *  window in which a planted symlink could redirect the restricted read. */
function readFileNoFollow(path, encoding = 'utf8') {
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  try {
    return readFileSync(fd, encoding)
  } finally {
    closeSync(fd)
  }
}

function readFileNoFollowIfExists(path, encoding = 'utf8') {
  try {
    return { exists: true, text: readFileNoFollow(path, encoding) }
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, text: null }
    throw error
  }
}

/** A crash can cut the journal's final frame before its delimiter. Replay reads
 *  that tail as an ordinary dropped crash — but an APPEND after it would
 *  concatenate the next frame onto the fragment, turning two harmless pieces
 *  into one delimited corrupt line and wedging the journal permanently. So the
 *  writer repairs BEFORE it appends: the fragment's bytes are preserved beside
 *  the journal (evidence, never silently eaten), then truncated away. */
function repairCutTail(store) {
  let fd
  try {
    fd = openSync(store.journalPath, fsConstants.O_RDWR | fsConstants.O_NOFOLLOW)
  } catch (error) {
    if (error?.code === 'ENOENT') return { repaired: false }
    throw error
  }
  try {
    const size = fstatSync(fd).size
    if (size === 0) return { repaired: false }
    const last = Buffer.alloc(1)
    readSync(fd, last, 0, 1, size - 1)
    if (last[0] === 0x0a) return { repaired: false }
    const buf = Buffer.alloc(size)
    let read = 0
    while (read < size) {
      const n = readSync(fd, buf, read, size - read, read)
      if (n <= 0) throw new Error('the journal shrank while its tail was being inspected')
      read += n
    }
    const cutAt = buf.lastIndexOf(0x0a) + 1
    const droppedPath = `${store.journalPath}.dropped-${randomBytes(8).toString('hex')}`
    writeFileAtomic(droppedPath, buf.subarray(cutAt).toString('utf8'))
    ftruncateSync(fd, cutAt)
    fsyncSync(fd)
    return { repaired: true, droppedPath }
  } finally {
    closeSync(fd)
  }
}

/** One journal append: frame, write, FLUSH, close. The frame is a single write of
 *  a single line, so a crash leaves either nothing or a truncated tail — the two
 *  cases replay reads as ordinary. A truncated tail left by an EARLIER crash is
 *  repaired (preserved beside the journal, then cut) before this frame goes in,
 *  because appending onto a fragment would weld it into delimited corruption.
 *  Returns the framed line's byte length so a caller can account, never the
 *  unflushed promise of one. */
/**
 * The lane's fence store: `{ generation, fence }`.
 *
 * The GENERATION is minted once, when the store is created, and never again —
 * `mayMintFence` refuses a store that has lost it rather than inventing one,
 * because a fresh generation silently invalidates every credential a running
 * publisher holds. The FENCE tracks the batch epoch and only ever RISES: it is
 * seeded from the owner lock at every daemon start, and a lock carrying an older
 * number than the store has already seen does not roll it back.
 *
 * A store that exists but cannot be read is a REFUSAL, never a re-mint: that is
 * the difference between an erased store (nothing to invalidate) and a corrupt
 * one (a running publisher whose generation we would be throwing away).
 */
export function ensureFenceStore(store, { fence } = {}) {
  if (!Number.isSafeInteger(fence) || fence < 1) return { ok: false, reason: 'a fence store is seeded with a usable fence' }
  const path = store.fenceStorePath
  const lockPath = `${path}.lock`
  let lockFd
  try {
    // O_EXCL is the compare-and-set for the whole read/decide/replace cycle.
    // Without it, two processes can both read 8 and commit 10 followed by 9.
    // A crash-left lock is evidence whose safe answer is refusal; removing one
    // automatically would need an ownership proof this layer does not have.
    lockFd = openSync(lockPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600)
  } catch (error) {
    return { ok: false, reason: `the fence store mutation is already in progress or cannot be serialized: ${error.message}` }
  }
  try {
    let existing = null
    try {
      existing = JSON.parse(readFileNoFollow(path))
    } catch (error) {
      if (error.code !== 'ENOENT') {
        return { ok: false, reason: `the fence store exists but cannot be read; minting over it would invalidate a live generation: ${error.message}` }
      }
    }
    if (existing) {
      if (typeof existing.generation !== 'string' || !existing.generation || !Number.isSafeInteger(existing.fence)) {
        return { ok: false, reason: 'the fence store has lost its generation or fence and refuses to invent one' }
      }
      if (fence <= existing.fence) return { ok: true, fenceStore: existing, minted: false }
      const raised = { ...existing, fence }
      writeFileAtomic(path, `${JSON.stringify(raised)}\n`)
      return { ok: true, fenceStore: raised, minted: false }
    }
    let journal
    try {
      journal = readJournal(store)
    } catch (error) {
      return { ok: false, reason: `the journal cannot be proved sound, so a fence generation will not be minted: ${error.message}` }
    }
    if (journal.verdict !== 'ok') {
      return { ok: false, reason: `the journal is ${journal.verdict}; minting a fence generation is refused` }
    }
    if (journal.exists) {
      return { ok: false, reason: 'the journal already exists but its fence generation is missing; minting a replacement is refused' }
    }
    const fresh = { v: SCHEMA_VERSION, generation: randomBytes(16).toString('hex'), fence }
    writeFileAtomic(path, `${JSON.stringify(fresh)}\n`)
    return { ok: true, fenceStore: fresh, minted: true }
  } finally {
    closeSync(lockFd)
    unlinkSync(lockPath)
  }
}

export function appendJournalEntry(store, entry) {
  const framed = frameEntry(entry)
  if (!framed.ok) return { ok: false, reason: framed.reason }
  refuseSymlink(store.journalPath, 'the journal')
  const repaired = repairCutTail(store)
  const journalFile = readFileNoFollowIfExists(store.journalPath)
  const exists = journalFile.exists
  const before = journalFile.text ?? ''
  const candidate = replayJournal(before + framed.line)
  const appended = candidate.entries.at(-1)
  if (candidate.verdict !== 'ok') {
    return { ok: false, reason: `the journal is corrupt and refuses an append: ${candidate.corruption.at(-1)?.reason ?? 'unknown corruption'}` }
  }
  if (!appended || appended.seq !== entry.seq || appended.quarantine) {
    return { ok: false, reason: `the journal refuses an entry without fence authority: ${appended?.quarantine ?? 'the entry could not be placed'}` }
  }
  // O_NOFOLLOW closes the check/open race the lstat above cannot: a symlink
  // swapped in between fails the open itself with ELOOP instead of being
  // followed anywhere the planter chose.
  const created = !exists
  const fd = openSync(store.journalPath, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, 0o600)
  try {
    writeAllSync(fd, framed.line)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  // The journal's very first entry created its FILENAME too, and a name is
  // durable only once the directory is flushed with it.
  if (created) fsyncDir(store.dir)
  return { ok: true, bytes: Buffer.byteLength(framed.line), ...(repaired.repaired ? { repairedTail: repaired.droppedPath } : {}) }
}

/** The journal, read and judged by the core. A missing journal is an EMPTY one
 *  only for a store that has never written; once anything else exists in the store
 *  the distinction matters, and the caller (mayMintFence) treats missing-beside-
 *  evidence as prohibiting. This reader only reports what it found. */
export function readJournal(store) {
  refuseSymlink(store.journalPath, 'the journal')
  const journal = readFileNoFollowIfExists(store.journalPath)
  return { exists: journal.exists, ...replayJournal(journal.text ?? '') }
}

/** WRITE–FLUSH–RENAME, the only way a committed snapshot or receipt is produced:
 *  the bytes are complete and flushed under a temporary name before the real name
 *  ever points at them, the rename is atomic, and the DIRECTORY is fsynced after
 *  it so the name change itself is durable. A crash at any step leaves either the
 *  old committed file or a `.tmp-` leftover the reader ignores.
 *
 *  The temporary name is RANDOM and the create EXCLUSIVE: a predictable
 *  pid-derived name is plantable as a symlink (O_EXCL fails on one, however
 *  dangling) and re-usable after pid recycling, where a truncating open would
 *  silently overwrite the crash evidence a leftover IS.
 *
 *  Exported: the daemon's own durable files — lease revocations, the lock copy,
 *  checkpoint requests — carry the same discipline instead of a weaker copy. */
export function writeFileAtomic(path, text) {
  refuseSymlink(path, 'an atomic write target')
  const tmp = `${path}.tmp-${randomBytes(8).toString('hex')}`
  const fd = openSync(tmp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600)
  try {
    writeAllSync(fd, text)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
  const dirFd = openSync(dirname(path), 'r')
  try {
    fsyncSync(dirFd)
  } finally {
    closeSync(dirFd)
  }
}

export function writeSnapshot(store, body) {
  const sealed = sealSnapshotText(body)
  if (!sealed.ok) return { ok: false, reason: sealed.reason }
  writeFileAtomic(store.snapshotPath, sealed.text)
  return { ok: true }
}

export function readSnapshot(store) {
  refuseSymlink(store.snapshotPath, 'the snapshot')
  const snapshot = readFileNoFollowIfExists(store.snapshotPath)
  return readSnapshotText(snapshot.text)
}

/** Receipts share the snapshot's sealing and owner-only discipline, but NOT its
 *  replacement: a receipt is durable EVIDENCE, and evidence is written once. A
 *  reused or racing receipt id must never silently overwrite what an earlier
 *  writer sealed, so the create is a hard-link into place — atomic, exclusive,
 *  first writer wins. Writing the SAME bytes again is idempotent; different
 *  bytes under an existing id are refused with both contents intact. */
export function writeReceipt(store, receiptId, body) {
  if (!validBatchId(receiptId)) return { ok: false, reason: `not a usable receipt id: ${JSON.stringify(receiptId)}` }
  const sealed = sealSnapshotText(body)
  if (!sealed.ok) return { ok: false, reason: sealed.reason }
  const path = join(store.receiptsDir, `${receiptId}.json`)
  assertInside(store.receiptsDir, path)
  refuseSymlink(path, 'a receipt')
  const sameAsExisting = () => {
    try {
      return readFileNoFollow(path) === sealed.text
    } catch {
      return false
    }
  }
  const tmp = `${path}.tmp-${randomBytes(8).toString('hex')}`
  const fd = openSync(tmp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600)
  try {
    writeAllSync(fd, sealed.text)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    // link(2) fails with EEXIST when the name is taken — unlike rename, which
    // replaces. That failure is the whole point: it is what makes two writers
    // racing on one id resolve to one durable receipt and one loud refusal.
    linkSync(tmp, path)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      /* the leftover is listed by abandonedTemporaries */
    }
    if (error?.code === 'EEXIST') {
      if (sameAsExisting()) {
        // The winning process may have crashed after link(2) but before its
        // directory fsync. This retry cannot claim durable idempotent success
        // until it has made the already-present name durable itself.
        fsyncDir(store.receiptsDir)
        return { ok: true, alreadyWritten: true }
      }
      return { ok: false, reason: `receipt ${receiptId} already exists with different content; a receipt is written once and never overwritten` }
    }
    return { ok: false, reason: `the receipt could not be created: ${error.message}` }
  }
  try {
    unlinkSync(tmp)
  } catch {
    /* the leftover is listed by abandonedTemporaries */
  }
  fsyncDir(store.receiptsDir)
  return { ok: true }
}

export function readReceipt(store, receiptId) {
  if (!validBatchId(receiptId)) return { ok: false, verdict: 'missing', reason: `not a usable receipt id: ${JSON.stringify(receiptId)}` }
  const path = join(store.receiptsDir, `${receiptId}.json`)
  assertInside(store.receiptsDir, path)
  refuseSymlink(path, 'a receipt')
  const receipt = readFileNoFollowIfExists(path)
  return readSnapshotText(receipt.text)
}

/** What the reader IGNORES tells the operator what a crash left behind: `.tmp-`
 *  leftovers are listed, never read, never silently deleted — they are the
 *  interrupted-replacement evidence the union's step 2 test asks about. */
export function abandonedTemporaries(store) {
  if (!existsSync(store.dir)) return []
  return readdirSync(store.dir)
    .filter((name) => name.includes('.tmp-'))
    .map((name) => join(store.dir, name))
}
