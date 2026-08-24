// THE DURABLE STATE STORE'S I/O (point 834, step 2), against a real filesystem in
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

describe('journal append and read-back', () => {
  it('appends framed lines and replays them whole', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    expect(appendJournalEntry(store, entry(1)).ok).toBe(true)
    expect(appendJournalEntry(store, entry(2)).ok).toBe(true)
    const journal = readJournal(store)
    expect(journal.exists).toBe(true)
    expect(journal.verdict).toBe('ok')
    expect(journal.entries.map((e) => e.seq)).toEqual([1, 2])
  })

  it('refuses to append what frameEntry refuses, and writes nothing for it', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    expect(appendJournalEntry(store, { seq: 0, fence: 7, kind: 'command' }).ok).toBe(false)
    expect(readJournal(store).exists).toBe(false)
  })

  it('reads a crash-cut final line as the ordinary dropped tail', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    appendJournalEntry(store, entry(1))
    appendJournalEntry(store, entry(2))
    const bytes = readFileSync(store.journalPath, 'utf8')
    writeFileSync(store.journalPath, bytes.slice(0, -15))
    const journal = readJournal(store)
    expect(journal.verdict).toBe('ok')
    expect(journal.entries).toHaveLength(1)
    expect(journal.droppedTail).not.toBeNull()
  })

  it('reads a tampered middle as corruption — the verdict mayMintFence refuses on', () => {
    const store = openStateStore({ repoDir: repo, batchId: 'b' })
    appendJournalEntry(store, entry(1))
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
