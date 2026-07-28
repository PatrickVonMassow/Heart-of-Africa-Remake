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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('batch-autostart is import-proof', () => {
  it('throws instead of spawning when it is imported rather than run', async () => {
    await expect(import('./batch-autostart.mjs')).rejects.toThrow(/CLI, not a module/)
  })
})

// ---------------------------------------------------------------------------
// THE PURE BUILDERS ARE ACTUALLY USED (four-eyes review 28.07.2026).
//
// Everything provable about the spawn — argv, the model chain and, above all, the
// environment that switches the 600-second background-task execution off — lives
// in scripts/batch-autostart-core.mjs and is pinned there. But the launcher is the
// only file that ever spawns, and it cannot be imported by a test (the assertion
// above is exactly why). So a future edit could re-inline the `spawn` call, drop
// the `env`, and every unit test would stay green while the four deaths of
// 28.07.2026 came straight back. Reading the source is the only witness available
// for that, so this is the one place the repository greps a file's text.
describe('the launcher uses the pure spawn builders', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts', 'batch-autostart.mjs'), 'utf8')
  // Prose ABOUT the fix is wanted; only the code may be judged for having it.
  const codeLines = source.split('\n').filter((l) => !l.trimStart().startsWith('//'))
  const code = codeLines.join('\n')

  it('imports buildSpawnArgs and buildSpawnOptions from the core', () => {
    const imports = source.match(/import\s*\{[^}]*\}\s*from\s*'\.\/batch-autostart-core\.mjs'/)
    expect(imports, 'no import from ./batch-autostart-core.mjs').not.toBeNull()
    expect(imports[0]).toMatch(/\bbuildSpawnArgs\b/)
    expect(imports[0]).toMatch(/\bbuildSpawnOptions\b/)
  })

  it('CALLS them at the one spawn site — a re-inlined call would drop the env fix', () => {
    // Every statement that actually launches a process: `spawn(<ident>, …`.
    const spawnSites = codeLines.filter((l) => /(?<![\w.])spawn\(\s*[A-Za-z_$][\w$]*\s*,/.test(l))
    expect(spawnSites, 'the launcher must have exactly one spawn( site').toHaveLength(1)
    expect(spawnSites[0]).toMatch(/buildSpawnArgs\(/)
    expect(spawnSites[0]).toMatch(/buildSpawnOptions\(/)
  })

  it('never names the runtime ceiling variable in CODE — the core owns that policy', () => {
    // A literal assignment here would sit outside every test in
    // batch-autostart-core.test.mjs, including the one that stops an inherited
    // value from re-arming the kill.
    expect(code).not.toMatch(/CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS/)
  })

  it('records every spawn in the ledger and reaps from it (finding 1.4)', () => {
    expect(source).toMatch(/spawns:\s*recordSpawn\(/)
    expect(source).toMatch(/reapableSpawns\(/)
  })

  // THE LAUNCHER ASKS ITS OWN QUESTION (second four-eyes review, finding A).
  // `assessOwnerWork` defaults to the launcher's window, but the launcher names it
  // anyway — and this pins that it does, because the window is the one input that
  // silently turned `work-stalled` into dead code. The behaviour itself is proved
  // on the real pipeline in scripts/batch-in-flight-core.test.mjs; this is only the
  // witness that the uncallable file still asks the right question.
  it('assesses the owner’s work with the LAUNCHER’s window, not the Stop guard’s', () => {
    expect(code).toMatch(/maxAgeMs:\s*LAUNCHER_WORK_MAX_AGE_MS/)
    expect(code, 'the guard’s 45-minute window makes the stall verdict unreachable').not.toMatch(
      /maxAgeMs:\s*IN_FLIGHT_MAX_AGE_MS/,
    )
  })
})
