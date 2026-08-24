// THE DURABLE STATE STORE'S I/O (point 892, step 2), against a real filesystem in
// a throwaway git repository: the store lands in the git COMMON directory so every
// worktree reaches the same record, appends survive as either whole lines or an
// ordinary-crash tail, snapshot replacement is atomic, and the reader refuses the
// paths an attacker or an accident could plant.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  abandonedTemporaries,
  appendJournalEntry,
  durabilityProbe,
  ensureFenceStore,
  openStateStore,
  readJournal,
  readReceipt,
  readSnapshot,
  stateRootFor,
  validBatchId,
  writeReceipt,
  writeSnapshot,
} from './batch-state.mjs'

let repo
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'batch-state-'))
  execFileSync('git', ['init', '-q'], { windowsHide: true, cwd: repo })
})
afterEach(() => {
  durabilityProbe.onDirFsync = null
  rmSync(repo, { recursive: true, force: true })
})

const entry = (seq, over = {}) => ({ seq, fence: 7, kind: 'command', key: `k${seq}`, ...over })

describe('openStateStore', () => {
  it('creates the store under the git common directory, owner-only', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'batch-1' })
    expect(store.dir.startsWith(join(repo, '.git', 'codex-batches'))).toBe(true)
    expect(store.looseModes).toEqual([])
  })

  it('reports a store whose modes somebody widened instead of silently tightening them', () => {
    const first = openStateStore({ repoDir: repo, batchId: 'batch-1' })
    chmodSync(first.dir, 0o755)
    const again = openStateStore({ repoDir: repo, batchId: 'batch-1' })
    expect(again.looseModes.map((l) => l.path)).toContain(first.dir)
  })

  it('refuses a batch id that could leave the root', () => {
    for (const bad of ['../x', 'a/b', '', '.hidden', 'a'.repeat(200), null]) {
      expect(validBatchId(bad), String(bad)).toBe(false)
      expect(() => openStateStore({ repoDir: repo, batchId: bad })).toThrow(/batch id/)
    }
  })

  it('refuses a store directory that is a symlink rather than following it', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'elsewhere-'))
    try {
      symlinkSync(elsewhere, join(repo, '.git', 'codex-batches'))
      expect(() => openStateStore({ repoDir: repo, batchId: 'batch-1' })).toThrow(/symlink/)
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  it('resolves the SAME store from the main tree and from a linked worktree', () => {
    execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'seed'], { windowsHide: true,
      cwd: repo,
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    })
    const wt = join(repo, 'wt')
    execFileSync('git', ['worktree', 'add', '-q', wt], { windowsHide: true, cwd: repo })
    expect(stateRootFor(wt)).toBe(stateRootFor(repo))
  })
})

describe('the lane\'s own fence store', () => {
  // The daemon refuses to serve without a generation, and the generation cannot
  // live in `.claude/batch-fence.json`: the batch singleton rebuilds that file
  // from a fixed field set on every acquisition, so the next acquire erases it.
  // Measured 24.08.2026 — the parent-death drill only passed because it wrote
  // that file by hand and no real acquisition ever touched it.
  it('mints a generation once, and keeps it while the fence rises', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b1' })
    const first = ensureFenceStore(store, { fence: 8 })
    expect(first.ok).toBe(true)
    expect(first.minted).toBe(true)
    expect(first.fenceStore.generation).toMatch(/^[0-9a-f]{32}$/)
    expect(first.fenceStore.fence).toBe(8)

    const raised = ensureFenceStore(store, { fence: 9 })
    expect(raised.ok).toBe(true)
    expect(raised.minted).toBe(false)
    // The SAME generation: a fresh one silently invalidates every credential a
    // running publisher still holds.
    expect(raised.fenceStore.generation).toBe(first.fenceStore.generation)
    expect(raised.fenceStore.fence).toBe(9)
    expect(JSON.parse(readFileSync(store.fenceStorePath, 'utf8')).fence).toBe(9)
  })

  it('never rolls the fence back to an older lock\'s number', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b1' })
    ensureFenceStore(store, { fence: 9 })
    const back = ensureFenceStore(store, { fence: 3 })
    expect(back.ok).toBe(true)
    expect(back.fenceStore.fence).toBe(9)
  })

  it('serializes the fence read and replacement so a racing writer cannot commit stale state', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b1' })
    ensureFenceStore(store, { fence: 8 })
    // This is the state while another ensureFenceStore call is between its read
    // and replacement. The old implementation ignored it and could replace 10
    // with a stale 9; a serialized implementation must not enter that window.
    writeFileSync(`${store.fenceStorePath}.lock`, 'writer in progress')
    const raced = ensureFenceStore(store, { fence: 9 })
    expect(raced.ok).toBe(false)
    expect(raced.reason).toMatch(/serialized/)
    expect(JSON.parse(readFileSync(store.fenceStorePath, 'utf8')).fence).toBe(8)
  })

  it('refuses a store it cannot read instead of minting a new generation over it', () => {
    // An ERASED store has nothing to invalidate and is re-minted; a CORRUPT one
    // may still belong to a live publisher, so it fails closed and waits for an
    // operator.
    const store = openStateStore({ repoDir: repo, batchId: 'b1' })
    ensureFenceStore(store, { fence: 8 })
    writeFileSync(store.fenceStorePath, '{ not json')
    const res = ensureFenceStore(store, { fence: 9 })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/cannot be read/)
  })

  it('refuses a store that lost its generation rather than inventing one', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b1' })
    writeFileSync(store.fenceStorePath, JSON.stringify({ v: 1, fence: 8 }))
    const res = ensureFenceStore(store, { fence: 9 })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/refuses to invent one/)
  })

  it('refuses to mint a missing generation beside a checksum-corrupt journal', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b1' })
    appendJournalEntry(store, entry(1, { kind: 'fence-transition' }))
    writeFileSync(store.journalPath, readFileSync(store.journalPath, 'utf8').replace('"fence":7', '"fence":8'))
    expect(readJournal(store).verdict).toBe('corrupt')
    const result = ensureFenceStore(store, { fence: 8 })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/journal is corrupt/)
    expect(existsSync(store.fenceStorePath)).toBe(false)
  })

  it('refuses to seed without a usable fence', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b1' })
    for (const fence of [undefined, 0, -1, 1.5, NaN, '8']) {
      expect(ensureFenceStore(store, { fence }).ok, String(fence)).toBe(false)
    }
  })
})

describe('journal append and read-back', () => {
  it('appends framed lines and replays them whole', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    expect(appendJournalEntry(store, entry(1, { kind: 'fence-transition' })).ok).toBe(true)
    expect(appendJournalEntry(store, entry(2)).ok).toBe(true)
    const journal = readJournal(store)
    expect(journal.exists).toBe(true)
    expect(journal.verdict).toBe('ok')
    expect(journal.entries.map((e) => e.seq)).toEqual([1, 2])
  })

  it('refuses to write anything under a fence before that fence transition is durable', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    const refused = appendJournalEntry(store, entry(1))
    expect(refused.ok).toBe(false)
    expect(refused.reason).toMatch(/without fence authority/)
    expect(readJournal(store).exists).toBe(false)
  })

  it('refuses to append what frameEntry refuses, and writes nothing for it', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    expect(appendJournalEntry(store, { seq: 0, fence: 7, kind: 'command' }).ok).toBe(false)
    expect(readJournal(store).exists).toBe(false)
  })

  it('reads a crash-cut final line as the ordinary dropped tail', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    appendJournalEntry(store, entry(1, { kind: 'fence-transition' }))
    appendJournalEntry(store, entry(2))
    appendJournalEntry(store, entry(3))
    const bytes = readFileSync(store.journalPath, 'utf8')
    writeFileSync(store.journalPath, bytes.slice(0, -15))
    const journal = readJournal(store)
    expect(journal.verdict).toBe('ok')
    expect(journal.entries).toHaveLength(2)
    expect(journal.droppedTail).not.toBeNull()
  })

  it('repairs a crash-cut tail on the NEXT append instead of welding it into corruption', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    appendJournalEntry(store, entry(1, { kind: 'fence-transition' }))
    appendJournalEntry(store, entry(2))
    appendJournalEntry(store, entry(3))
    const bytes = readFileSync(store.journalPath, 'utf8')
    const cut = bytes.slice(0, -15) // entry 2 loses its delimiter and tail
    writeFileSync(store.journalPath, cut)
    // Without the repair, this append would concatenate onto the fragment and
    // replay would see one delimited corrupt line — a permanently wedged journal.
    const appended = appendJournalEntry(store, entry(4))
    expect(appended.ok).toBe(true)
    const journal = readJournal(store)
    expect(journal.verdict).toBe('ok')
    expect(journal.entries.map((e) => e.seq)).toEqual([1, 2, 4])
    expect(journal.droppedTail).toBeNull()
    // The fragment is preserved beside the journal as evidence, never eaten.
    const fragment = cut.slice(cut.lastIndexOf('\n') + 1)
    expect(appended.repairedTail).toBeTruthy()
    expect(readFileSync(appended.repairedTail, 'utf8')).toBe(fragment)
  })

  it('reads a tampered middle as corruption — the verdict mayMintFence refuses on', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    appendJournalEntry(store, entry(1, { kind: 'fence-transition' }))
    appendJournalEntry(store, entry(2))
    writeFileSync(store.journalPath, readFileSync(store.journalPath, 'utf8').replace('"k1"', '"kX"'))
    expect(readJournal(store).verdict).toBe('corrupt')
  })

  it('refuses a DANGLING journal symlink instead of creating its target elsewhere', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'batch-dangle' })
    const target = join(repo, 'planted-target.jsonl')
    symlinkSync(target, store.journalPath) // target does NOT exist: existsSync would say false
    expect(() => appendJournalEntry(store, entry(1))).toThrow(/symlink|ELOOP/)
    expect(existsSync(target)).toBe(false)
    expect(() => readJournal(store)).toThrow(/symlink/)
  })

  it('refuses a journal that is a symlink', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    writeFileSync(join(repo, 'outside.jsonl'), '')
    symlinkSync(join(repo, 'outside.jsonl'), store.journalPath)
    expect(() => appendJournalEntry(store, entry(1))).toThrow(/symlink/)
    expect(() => readJournal(store)).toThrow(/symlink/)
  })
})

describe('atomic snapshot replacement', () => {
  it('replaces the snapshot atomically and reads the new one back', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    expect(writeSnapshot(store, { batchId: 'b', lastSeq: 1 }).ok).toBe(true)
    expect(writeSnapshot(store, { batchId: 'b', lastSeq: 2 }).ok).toBe(true)
    const back = readSnapshot(store)
    expect(back.ok).toBe(true)
    expect(back.snapshot.lastSeq).toBe(2)
  })

  it('an interrupted replacement leaves the committed snapshot untouched and the leftover listed', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    writeSnapshot(store, { batchId: 'b', lastSeq: 1 })
    // A crash between write and rename is exactly a .tmp- file beside the real one.
    writeFileSync(`${store.snapshotPath}.tmp-99999`, '{ half of a snap')
    const back = readSnapshot(store)
    expect(back.ok).toBe(true)
    expect(back.snapshot.lastSeq).toBe(1)
    expect(abandonedTemporaries(store)).toHaveLength(1)
  })

  it('refuses an atomic write whose committed target is a symlink', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'batch-symtarget' })
    symlinkSync(join(repo, 'outside.json'), store.snapshotPath)
    expect(() => writeSnapshot(store, { planted: true })).toThrow(/symlink/)
    expect(existsSync(join(repo, 'outside.json'))).toBe(false)
  })

  it('judges a missing snapshot as missing and a truncated one as corrupt', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    expect(readSnapshot(store).verdict).toBe('missing')
    writeSnapshot(store, { batchId: 'b' })
    const bytes = readFileSync(store.snapshotPath, 'utf8')
    writeFileSync(store.snapshotPath, bytes.slice(0, 12))
    expect(readSnapshot(store).verdict).toBe('corrupt')
  })
})

describe('receipts', () => {
  it('stores and returns a sealed receipt under its id', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    expect(writeReceipt(store, 'boundary-1', { kind: 'boundary', fence: 7 }).ok).toBe(true)
    const back = readReceipt(store, 'boundary-1')
    expect(back.ok).toBe(true)
    expect(back.snapshot).toMatchObject({ kind: 'boundary', fence: 7 })
  })

  it('a receipt is written ONCE: same bytes are idempotent, different bytes are refused with the original intact', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    expect(writeReceipt(store, 'sealed-1', { kind: 'boundary', fence: 7 }).ok).toBe(true)
    // The exact same body again: idempotent, not an overwrite.
    const again = writeReceipt(store, 'sealed-1', { kind: 'boundary', fence: 7 })
    expect(again.ok).toBe(true)
    expect(again.alreadyWritten).toBe(true)
    // A DIFFERENT body under the same id is a reused or racing receipt id, and
    // silently replacing durable evidence with another validly sealed body is
    // exactly what create-once exists to prevent.
    const clash = writeReceipt(store, 'sealed-1', { kind: 'boundary', fence: 8 })
    expect(clash.ok).toBe(false)
    expect(clash.reason).toMatch(/already exists with different content/)
    expect(readReceipt(store, 'sealed-1').snapshot).toMatchObject({ fence: 7 })
  })

  it('flushes the receipt directory before identical EEXIST is reported as durable success', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    writeReceipt(store, 'sealed-1', { kind: 'boundary', fence: 7 })
    const flushed = []
    durabilityProbe.onDirFsync = (path) => flushed.push(path)
    const again = writeReceipt(store, 'sealed-1', { kind: 'boundary', fence: 7 })
    expect(again).toMatchObject({ ok: true, alreadyWritten: true })
    expect(flushed).toContain(store.receiptsDir)
  })

  it('refuses a receipt id that is a path, and a receipt that is a symlink', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    expect(writeReceipt(store, '../escape', {}).ok).toBe(false)
    expect(readReceipt(store, 'a/b').ok).toBe(false)
    writeFileSync(join(repo, 'outside.json'), '{}')
    symlinkSync(join(repo, 'outside.json'), join(store.receiptsDir, 'planted.json'))
    expect(() => readReceipt(store, 'planted')).toThrow(/symlink/)
    unlinkSync(join(store.receiptsDir, 'planted.json'))
  })
})
