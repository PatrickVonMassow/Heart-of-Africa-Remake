// THE DURABLE STATE STORE'S I/O — step 2 of the "Ordered work" in
// docs/handover-architecture.md (work-order point 834, the front stage of 676).
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
// chose. Symlink checks are lstat-based and happen on every open, not once.
//
// STILL DARK: nothing on today's authoring path imports this file; its first
// runtime caller is the daemon of step 3, and the activation flag refuses to
// enable while steps 8 and 9 are not green.
import { closeSync, constants as fsConstants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, writeSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { frameEntry } from './batch-schema-core.mjs'
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
  } catch {
    return // absent is fine; the opens below guard creation with O_NOFOLLOW or exclusivity
  }
  if (stat.isSymbolicLink()) throw new Error(`${what} is a symlink and is refused: ${path}`)
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
    mkdirSync(p, { recursive: true, mode: 0o700 })
  }
  const receiptsDir = join(dir, 'receipts')
  refuseSymlink(receiptsDir, 'the receipts directory')
  mkdirSync(receiptsDir, { recursive: true, mode: 0o700 })
  const store = {
    batchId,
    dir,
    journalPath: join(dir, 'events.jsonl'),
    snapshotPath: join(dir, 'snapshot.json'),
    daemonRecordPath: join(dir, 'daemon.json'),
    receiptsDir,
  }
  const loose = []
  for (const p of [dir, receiptsDir]) {
    const mode = statSync(p).mode & 0o777
    if (mode & 0o077) loose.push({ path: p, mode: mode.toString(8) })
  }
  return { ...store, looseModes: loose }
}

/** One journal append: frame, write, FLUSH, close. The frame is a single write of
 *  a single line, so a crash leaves either nothing or a truncated tail — the two
 *  cases replay reads as ordinary. Returns the framed line's byte length so a
 *  caller can account, never the unflushed promise of one. */
export function appendJournalEntry(store, entry) {
  const framed = frameEntry(entry)
  if (!framed.ok) return { ok: false, reason: framed.reason }
  refuseSymlink(store.journalPath, 'the journal')
  // O_NOFOLLOW closes the check/open race the lstat above cannot: a symlink
  // swapped in between fails the open itself with ELOOP instead of being
  // followed anywhere the planter chose.
  const fd = openSync(store.journalPath, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, 0o600)
  try {
    writeSync(fd, framed.line)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  return { ok: true, bytes: Buffer.byteLength(framed.line) }
}

/** The journal, read and judged by the core. A missing journal is an EMPTY one
 *  only for a store that has never written; once anything else exists in the store
 *  the distinction matters, and the caller (mayMintFence) treats missing-beside-
 *  evidence as prohibiting. This reader only reports what it found. */
export function readJournal(store) {
  refuseSymlink(store.journalPath, 'the journal')
  if (!existsSync(store.journalPath)) return { exists: false, ...replayJournal('') }
  return { exists: true, ...replayJournal(readFileSync(store.journalPath, 'utf8')) }
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
 *  silently overwrite the crash evidence a leftover IS. */
function writeFileAtomic(path, text) {
  refuseSymlink(path, 'an atomic write target')
  const tmp = `${path}.tmp-${randomBytes(8).toString('hex')}`
  const fd = openSync(tmp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600)
  try {
    writeSync(fd, text)
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
  if (!existsSync(store.snapshotPath)) return readSnapshotText(null)
  return readSnapshotText(readFileSync(store.snapshotPath, 'utf8'))
}

/** Receipts share the snapshot's discipline: sealed, atomic, owner-only. The name
 *  is the receipt's id, one path segment like a batch id. */
export function writeReceipt(store, receiptId, body) {
  if (!validBatchId(receiptId)) return { ok: false, reason: `not a usable receipt id: ${JSON.stringify(receiptId)}` }
  const sealed = sealSnapshotText(body)
  if (!sealed.ok) return { ok: false, reason: sealed.reason }
  const path = join(store.receiptsDir, `${receiptId}.json`)
  assertInside(store.receiptsDir, path)
  writeFileAtomic(path, sealed.text)
  return { ok: true }
}

export function readReceipt(store, receiptId) {
  if (!validBatchId(receiptId)) return { ok: false, verdict: 'missing', reason: `not a usable receipt id: ${JSON.stringify(receiptId)}` }
  const path = join(store.receiptsDir, `${receiptId}.json`)
  assertInside(store.receiptsDir, path)
  refuseSymlink(path, 'a receipt')
  if (!existsSync(path)) return readSnapshotText(null)
  return readSnapshotText(readFileSync(path, 'utf8'))
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
