// The launcher must never run because someone LOOKED at it (27.07.2026).
//
// scripts/batch-autostart.mjs does all its work at module load: guards, liveness
// assessment, lock acquisition and — at the end — spawning a headless claude
// session. So a plain `import()` of it, which is what a syntax check or a tooling
// scan looks like, is indistinguishable from running it. That is not theoretical:
// `node -e "import('./scripts/batch-autostart.mjs')"` launched a session inside a
// git worktree during the work on point 373, and the spawned session claimed that
// worktree's batch lock before it could be killed.
//
// The file therefore throws unless it is the process entry point. This test is the
// witness — and it is safe precisely because the throw comes before the first side
// effect, which is the property being pinned.
import { describe, it, expect } from 'vitest'

describe('batch-autostart is import-proof', () => {
  it('throws instead of spawning when it is imported rather than run', async () => {
    await expect(import('./batch-autostart.mjs')).rejects.toThrow(/CLI, not a module/)
  })
})
