// The rule-corpus COUNT decides whether the periodic review is owed by growth.
// It is filesystem-shaped, so it is exercised against real temp directories
// rather than mocked away — the defect it exists to prevent was precisely a
// path that resolved to nothing while the function kept answering a number.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { countCorpusEntries } from './rule-review-state.mjs'

let root
let memoryDir

beforeAll(() => {
  root = mkdtempSync(resolve(tmpdir(), 'rule-review-state-'))
  memoryDir = resolve(root, 'memory')
  mkdirSync(memoryDir)
  mkdirSync(resolve(root, 'scripts'))
  for (const f of ['MEMORY.md', 'one.md', 'two.md', 'three.md']) {
    writeFileSync(resolve(memoryDir, f), '# x')
  }
  for (const f of ['a-guard.mjs', 'b-hook.mjs', 'a-guard-core.mjs', 'plain.mjs', 'a-guard-core.test.mjs']) {
    writeFileSync(resolve(root, 'scripts', f), '// x')
  }
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('countCorpusEntries', () => {
  it('counts memories and enforcers together, and the index is not a rule', () => {
    // 3 memories (MEMORY.md excluded) + 2 enforcers (cores/tests/plain excluded).
    expect(countCorpusEntries({ repoRoot: root, memoryDir })).toBe(5)
  })

  it('returns null rather than a PARTIAL count when the memory dir is missing', () => {
    // The live cause: a git worktree derives a memory path that does not exist.
    // Answering "2" here would make the growth trigger unfirable and would
    // poison the recorded baseline for the main tree.
    expect(countCorpusEntries({ repoRoot: root, memoryDir: resolve(root, 'nope') })).toBeNull()
  })

  it('returns null when the scripts half is missing too', () => {
    expect(countCorpusEntries({ repoRoot: resolve(root, 'nope'), memoryDir })).toBeNull()
  })

  it('never throws on an unusable input — the guard must stay fail-open', () => {
    expect(() => countCorpusEntries({ repoRoot: '', memoryDir: '' })).not.toThrow()
    expect(countCorpusEntries({ repoRoot: '', memoryDir: '' })).toBeNull()
  })
})
