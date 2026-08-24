// THE DURABILITY BOUNDARY OF NEW NAMES (point 892, step 2): an fsynced file
// can vanish with its filename after a crash when the DIRECTORY entry never
// reached the disk, so creating the store subtree and creating the journal
// must each flush the directory holding the new name. A crash cannot be
// simulated on this layer, and fsync is invisible from outside the process, so
// the module exposes durabilityProbe as the recording seam these cases pin.
import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { appendJournalEntry, durabilityProbe, openStateStore, stateRootFor } from './batch-state.mjs'

afterEach(() => {
  durabilityProbe.onDirFsync = null
})

describe('parent-directory fsync on creation', () => {
  it('flushes the parents of a new store subtree and of a newly created journal', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'dura-'))
    const flushed = []
    durabilityProbe.onDirFsync = (path) => flushed.push(path)
    try {
      const repo = join(sandbox, 'repo')
      execFileSync('git', ['init', '-q', repo], { windowsHide: true })
      const root = stateRootFor(repo)
      const store = openStateStore({ repoDir: repo, batchId: 'dura-batch' })
      // Creating <common>/codex-batches, the batch dir and receipts each
      // flushed the directory holding the new name.
      expect(flushed, flushed.join('\n')).toContain(dirname(root))
      expect(flushed).toContain(root)
      expect(flushed).toContain(store.dir)
      flushed.length = 0
      const appended = appendJournalEntry(store, { v: 1, seq: 1, fence: 1, kind: 'fence-transition' })
      expect(appended.ok, appended.reason).toBe(true)
      // The first append created the journal's NAME: its directory is flushed.
      expect(flushed).toContain(store.dir)
      flushed.length = 0
      const again = appendJournalEntry(store, { v: 1, seq: 2, fence: 1, kind: 'fence-transition' })
      expect(again.ok).toBe(true)
      // Later appends flush only the file: the name already survives.
      expect(flushed).not.toContain(store.dir)
      // Re-opening an EXISTING store creates nothing and flushes no directory.
      openStateStore({ repoDir: repo, batchId: 'dura-batch' })
      expect(flushed).toEqual([])
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })
})
