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
    // Every statement that launches an executable BY PATH: an optional member
    // prefix, one of the launching functions, then an identifier argument. The
    // first version of this counted bare `spawn(` only, so `cp.spawn(…)` or
    // `spawnSync(…)` would have escaped the exactly-one pin entirely (second
    // four-eyes review, finding D). `spawn(s)` in a log line is not a call site,
    // hence the identifier-and-comma shape; `execSync('git …')` passes a string
    // literal, so the legitimate git calls are not caught either.
    const LAUNCHES = /(?:^|[^\w.])(?:[A-Za-z_$][\w$]*\.)?(?:spawnSync|spawn|execFileSync|execFile|fork)\s*\(\s*[A-Za-z_$][\w$]*\s*,/
    const spawnSites = codeLines.filter((l) => LAUNCHES.test(l))
    expect(spawnSites, 'the launcher must have exactly one process-launching site').toHaveLength(1)
    expect(spawnSites[0]).toMatch(/buildSpawnArgs\(/)
    expect(spawnSites[0]).toMatch(/buildSpawnOptions\(/)
  })

  it('never builds a spawn environment in CODE — the core owns that policy', () => {
    // A literal assignment here would sit outside every test in
    // batch-autostart-core.test.mjs, including the one that stops an inherited
    // value from re-arming the kill. Forbidding the two variable NAMES is not
    // enough (finding D): assembling an `env:` at all is how the builder's
    // environment gets bypassed, whatever the keys are called.
    expect(code).not.toMatch(/CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS/)
    expect(code).not.toMatch(/HOA_BG_WAIT_CEILING_MS/)
    expect(code, 'the spawn environment is assembled in the core, never here').not.toMatch(/\benv\s*:/)
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

  // THE LEAK SWEEP RUNS BEFORE EVERY "DO NOT SPAWN" GUARD (second four-eyes
  // review, finding C). Order is the whole behaviour here, and order is only
  // visible in the source — the file cannot be imported. The sweep sat BELOW the
  // guards, and the one it sat below most often is `open === 0`: the final session
  // of a completed batch is exactly the one whose dev server outlives it, so from
  // the next tick onward the launcher exited at "batch complete" and never looked
  // at the ledger again. The leak the ledger was built for was the one it missed.
  it('sweeps the spawn ledger BEFORE any guard may exit the tick', () => {
    const lineOf = (re, what) => {
      const i = codeLines.findIndex((l) => re.test(l))
      expect(i, `no line matching ${what}`).toBeGreaterThanOrEqual(0)
      return i
    }
    const sweep = lineOf(/reapableSpawns\(/, 'the ledger sweep')
    for (const [re, what] of [
      [/batch-paused/, 'the user-paused guard'],
      [/openPointCount\(\)/, 'the work-order read'],
      [/open === 0/, 'the batch-complete guard'],
      [/reserved\.honour/, 'the honoured user claim'],
    ]) {
      expect(sweep, `the sweep must run before ${what}`).toBeLessThan(lineOf(re, what))
    }
  })

  it('…and every one of those exits persists the state the sweep just changed', () => {
    // A pruned ledger that is never written back is a sweep that half happened.
    const first = codeLines.findIndex((l) => /reapableSpawns\(/.test(l))
    const claimEnd = codeLines.findIndex((l) => /reserved\.honour/.test(l))
    const early = codeLines.slice(first, claimEnd + 12)
    expect(early.some((l) => /\bbail\(/.test(l)), 'the early guards must exit through bail()').toBe(true)
    for (const l of early) {
      expect(l, 'an early exit that skips the state write').not.toMatch(/process\.exit\(/)
    }
    expect(code).toMatch(/const bail =[^\n]*writeJsonAtomic\(C\('autostart-state\.json'\), state\)/)
  })
})

// ---------------------------------------------------------------------------
// THE BOARD WATCHDOG IS WIRED (point 400, delta E).
//
// Every rule the watchdog applies is pure and pinned in board-currency-core.test
// (behind / settling / unreachable / the alert key). What no unit test can see is
// whether the launcher CALLS them — the file cannot be imported, by design. So
// the same source-reading witness the spawn builders get is used here: the delta
// is worthless if a future edit drops the block, and every other test would stay
// green while it did.
describe('the launcher runs the board watchdog', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts', 'batch-autostart.mjs'), 'utf8')
  const codeLines = source.split('\n').filter((l) => !l.trimStart().startsWith('//'))
  const code = codeLines.join('\n')
  const lineOf = (re, what) => {
    const i = codeLines.findIndex((l) => re.test(l))
    expect(i, `no line matching ${what}`).toBeGreaterThanOrEqual(0)
    return i
  }

  it('holds NO fetch of its own — a fetch here would abort its own exit', () => {
    // Measured: on this platform a `process.exit()` after any fetch tears
    // undici's socket down mid-close and aborts the process (exit 127,
    // `UV_HANDLE_CLOSING`). This launcher exits that way at fifteen points, so
    // the check runs as a child. A future edit inlining it would look harmless
    // and break every tick.
    expect(code).not.toMatch(/\bfetch\(/)
  })

  it('delegates the check to the watchdog child and reads its verdict back', () => {
    expect(code).toMatch(/board-watchdog\.mjs/)
    expect(code).toMatch(/state\.boardWatchKey = r\.key/)
    // A hung child may not hold the tick either.
    expect(code).toMatch(/timeout: \d+/)
  })

  it('runs BEFORE every reason not to spawn except the user pause', () => {
    // "No successor is needed" is not "the board is fine". A complete, claimed
    // or wedged batch is exactly when a stale board goes unnoticed longest.
    const watch = lineOf(/board-watchdog\.mjs/, 'the board watchdog call')
    expect(lineOf(/batch-paused/, 'the user pause')).toBeLessThan(watch)
    for (const [re, what] of [
      [/openPointCount\(\)/, 'the work-order read'],
      [/open === 0/, 'the batch-complete guard'],
      [/reserved\.honour/, 'the honoured user claim'],
    ]) {
      expect(watch, `the watchdog must run before ${what}`).toBeLessThan(lineOf(re, what))
    }
  })

  it('cannot stop the launcher: the block is wrapped and fails open', () => {
    // A board check that could throw would take the RESURRECTION down with it —
    // the launcher's job is bringing the batch back, and this is a backstop.
    const watch = lineOf(/board-watchdog\.mjs/, 'the board watchdog call')
    const opener = [...codeLines.slice(0, watch)].reverse().find((l) => /^(try \{|\} catch)/.test(l))
    expect(opener, 'the watchdog is not inside a try block').toMatch(/^try \{/)
    expect(code).toMatch(/board watchdog skipped/)
  })
})

// The child the launcher delegates to. It is importable (no side effects at
// load beyond its own run), but it fetches, so it is read rather than run.
describe('the board watchdog child', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts', 'board-watchdog.mjs'), 'utf8')
  const code = source.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')

  it('reads the LIVE page — the point of delta E is not reading a state file', () => {
    expect(code).toMatch(/fetch\(liveCheckUrl\(BOARD_CONTENT_URL/)
    expect(code).toMatch(/liveBoardVerdict\(\{/)
    expect(code).toMatch(/watchdogDecision\(\{/)
    expect(code).toMatch(/await notify\(d\.title, d\.message, d\.priority\)/)
  })

  it('bounds the fetch and clears its timer', () => {
    expect(code).toMatch(/AbortController/)
    expect(code).toMatch(/clearTimeout\(timer\)/)
  })

  it('always answers, never throws out — its caller parses one json line', () => {
    expect(code).toMatch(/catch \(e\) \{\s*say\(\{ verdict: 'error'/)
    expect(code).not.toMatch(/process\.exit\(/)
  })
})
