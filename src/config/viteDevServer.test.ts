// @vitest-environment node
// The dev server the picture runs use serves the repo root. Author worktrees
// under `.claude/worktrees/` and scratch output under `local/` must neither
// trigger its watcher nor feed its dependency scanner, or creating a worktree
// reloads the page under a running suite.
import { fileURLToPath } from 'node:url'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

describe('the dev server ignores worktrees and scratch output', async () => {
  const config = await resolveConfig({ root: repoRoot, logLevel: 'silent' }, 'serve')

  it('adds root-anchored .claude and local to the watch ignores', () => {
    const ignored = config.server.watch?.ignored
    expect(ignored).toEqual(
      expect.arrayContaining([`${repoRoot}.claude/**`, `${repoRoot}local/**`]),
    )
    // Anchored, not `**/.claude/**`: a checkout served from a worktree under
    // .claude/ must still watch its own sources.
    expect(ignored).not.toEqual(expect.arrayContaining(['**/.claude/**']))
  })

  it('scans every html entry except those under .claude and local', () => {
    const entries = config.optimizeDeps.entries as string[]
    expect(entries).toContain('**/*.html')
    expect(entries).toEqual(expect.arrayContaining(['!.claude/**', '!local/**']))
  })
})
