// @vitest-environment node
// The dev server the picture runs use serves the repo root. Author worktrees
// under `.claude/worktrees/` and scratch output under `local/` must neither
// trigger its watcher nor feed its dependency scanner, or creating a worktree
// reloads the page under a running suite.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

describe('the dev server ignores worktrees and scratch output', async () => {
  const config = await resolveConfig({ root: repoRoot, logLevel: 'silent' }, 'serve')

  it('keeps Vite defaults and adds .claude and local to the watch ignores', () => {
    const ignored = config.server.watch?.ignored
    expect(ignored).toEqual(expect.arrayContaining(['**/.claude/**', '**/local/**']))
  })

  it('scans every html entry except those under .claude and local', async () => {
    const entries = config.optimizeDeps.entries as string[]
    expect(entries).toContain('**/*.html')
    expect(entries).toEqual(expect.arrayContaining(['!**/.claude/**', '!**/local/**']))
    // Same globber and options family Vite's scanner uses.
    const { glob } = await import('tinyglobby')
    const dir = mkdtempSync(join(tmpdir(), 'hoa-vite-scan-'))
    try {
      for (const f of ['index.html', 'public/board/index.html', '.claude/worktrees/p/index.html', 'local/x/index.html']) {
        mkdirSync(join(dir, f, '..'), { recursive: true })
        writeFileSync(join(dir, f), '<html></html>')
      }
      const found = (await glob(entries, { cwd: dir, ignore: ['**/node_modules/**'] })).sort()
      expect(found).toEqual(['index.html', 'public/board/index.html'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
