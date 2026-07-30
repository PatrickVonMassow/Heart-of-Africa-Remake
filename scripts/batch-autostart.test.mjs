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
      [/reservation\.acquire/, 'the user claim that reserves the batch'],
    ]) {
      expect(sweep, `the sweep must run before ${what}`).toBeLessThan(lineOf(re, what))
    }
  })

  it('…and every one of those exits persists the state the sweep just changed', () => {
    // A pruned ledger that is never written back is a sweep that half happened.
    const first = codeLines.findIndex((l) => /reapableSpawns\(/.test(l))
    const claimEnd = codeLines.findIndex((l) => /reservation\.acquire/.test(l))
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
      [/reservation\.acquire/, 'the user claim that reserves the batch'],
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

  it('reports what notify() DID, not what was decided', () => {
    // notify() returns false on a missing topic or a failed POST and never
    // throws. Reporting the intention would let the launcher key a fault whose
    // alert never left the machine — and a keyed fault is never announced
    // again, so one transient POST failure would silence it for good.
    expect(code).toMatch(/const sent = d\.notify && !quiet \? await notify\(/)
    expect(code).toMatch(/notified: !!sent/)
  })
})

// The launcher only remembers a fault as reported when it really was reported.
describe('the launcher keys a board fault only on a real notification', () => {
  const code = readFileSync(resolve(process.cwd(), 'scripts', 'batch-autostart.mjs'), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n')

  it('stores the key under r.notified, and forgets it only when nothing is wrong', () => {
    expect(code).toMatch(/if \(r\.notified\) \{/)
    expect(code).toMatch(/state\.boardWatchKey = r\.key/)
    expect(code).toMatch(/else if \(r\.key === null\)/)
  })
})

// ---------------------------------------------------------------------------
// POINT 443 (g) + (h) — wiring the launcher cannot prove any other way.
//
// The pure rules are pinned in batch-doctor-core.test.mjs and the filesystem
// mechanics in batch-doctor-states.test.mjs. What NEITHER can see is whether the
// launcher actually calls them: this file cannot be imported (the assertion at the
// top of this suite is exactly why), so the source-reading witness the spawn
// builders and the board watchdog already get is the only instrument available.
describe('the launcher lets a provably dead pid outrank an expired lease (443 g)', () => {
  const codeLines = readFileSync(resolve(process.cwd(), 'scripts', 'batch-autostart.mjs'), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
  const code = codeLines.join('\n')

  it('passes the pid probe AND the lock into repoRepairAllowed', () => {
    // Without both, the decision cannot tell a dead owner from a silent one, and
    // an owner that is BOTH dead and lease-expired keeps its tree unmended.
    expect(code).toMatch(/repoRepairAllowed\(assessment\.reason,\s*\{[^}]*\bprobe\b[^}]*\block\b[^}]*\}\)/)
  })

  it('still decides the WRITE through the pure core, never inline', () => {
    expect(code).toMatch(/import \{[^}]*repoRepairAllowed[^}]*\} from '\.\/batch-doctor-core\.mjs'/)
    expect(codeLines.filter((l) => /repoRepairAllowed\(/.test(l))).toHaveLength(1)
  })
})

describe('the launcher persists its state on the two spawn-failure exits (443 h)', () => {
  const codeLines = readFileSync(resolve(process.cwd(), 'scripts', 'batch-autostart.mjs'), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
  const code = codeLines.join('\n')

  it('leaves NO bare process.exit(1) after the repo alert was recorded', () => {
    // `state.repoAlertAt` is written minutes before these two exits. A bare exit
    // throws it away, so the standing repo alert fires again at the very next
    // tick — an unthrottled alarm every quarter of an hour, in a mode that is
    // already alarming.
    const alertAt = codeLines.findIndex((l) => /state\.repoAlertAt = now/.test(l))
    expect(alertAt, 'the repo alert stamp must exist').toBeGreaterThanOrEqual(0)
    const after = codeLines.slice(alertAt)
    for (const l of after) {
      if (/process\.exit\(1\)/.test(l)) throw new Error(`a bare exit(1) after the repo alert: ${l.trim()}`)
    }
  })

  it('exits both failure paths through bail(), which writes the state first', () => {
    expect(code).toMatch(/no bundled claude\.exe found[\s\S]{0,400}?bail\(1\)/)
    expect(code).toMatch(/could not spawn claude[\s\S]{0,400}?bail\(1\)/)
    expect(code).toMatch(/const bail =[^\n]*writeJsonAtomic\(C\('autostart-state\.json'\), state\)/)
  })

  it('writes and clears the mandate marker through the tested helpers', () => {
    expect(code).toMatch(/import \{[^}]*writeMandateMarker[^}]*\} from '\.\/batch-doctor-states\.mjs'/)
    expect(code).toMatch(/writeMandateMarker\(\{ path: C\('repo-mandate\.json'\)/)
    expect(code).toMatch(/clearMandateMarker\(\{ path: C\('repo-mandate\.json'\) \}\)/)
    // The hand-written rmSync/writeJsonAtomic pair is gone: one-shot, expiry and
    // the false-mandate clear are one mechanism now, and it is under test.
    expect(code).not.toMatch(/rmSync\(C\('repo-mandate\.json'\)/)
    expect(code).not.toMatch(/writeJsonAtomic\(C\('repo-mandate\.json'\)/)
  })
})

// The doctor's own wiring: the states module is what makes the six torn states
// visible at all, and a plan the wrapper never executes is a plan that repairs
// nothing.
describe('the doctor gathers and executes the torn states (443 a-f)', () => {
  const doctor = readFileSync(resolve(process.cwd(), 'scripts', 'batch-doctor.mjs'), 'utf8')

  it('gathers every one of the six', () => {
    for (const fn of [
      'findStaleGitLocks',
      'findWorktreeTrouble',
      'findStrayVerifyProcesses',
      'tasksRecoverableFromHead',
      'findStalePendingSpawn',
      'findBoardBehind',
    ]) {
      expect(doctor.includes(`${fn}(`), `${fn} is never called`).toBe(true)
    }
  })

  it('executes every action its planner can plan', () => {
    for (const [action, fn] of [
      ['clear-stale-git-locks', 'clearStaleGitLocks'],
      ['prune-worktrees', 'pruneWorktrees'],
      ['remove-orphan-worktrees', 'removeOrphanWorktrees'],
      ['kill-stray-verify-processes', 'killStrayProcesses'],
      ['restore-tasks-from-head', 'restoreTasksFromHead'],
      ['clear-stale-pending-lock', 'clearStalePendingSpawn'],
      ['republish-board', 'republishBoard'],
    ]) {
      expect(doctor.includes(`'${action}'`), `${action} is planned but never executed`).toBe(true)
      expect(doctor.includes(`${fn}(`), `${action}'s repair (${fn}) is never called`).toBe(true)
    }
  })

  it('reads the work-order parse rule from the shared helper, not a second copy', () => {
    expect(doctor).toMatch(/tasksTextParses\(/)
    expect(doctor).not.toMatch(/sawCheckbox/)
  })

  // --- The four-eyes fixes, at the one place a module test cannot reach them ---
  it('gathers ownerAlive INSIDE the fail-open wrapper, and defaults it to TRUE', () => {
    // `ownerAlive` GATES the process sweep, so an unreadable owner state must
    // SUPPRESS the kill, never license it — and outside the wrapper a probe fault
    // would abort the whole gather block (four-eyes F5).
    expect(doctor).toMatch(/const ownerAlive = gather\(/)
    expect(doctor).toMatch(/'the owner liveness',[\s\S]{0,400}?\n {2}true,\n\)/)
  })

  it('re-reads the pending lock at execute time rather than deleting the path blind', () => {
    expect(doctor).toMatch(/clearStalePendingSpawn\(\{ lockPath: LOCK_PATH,[^\n]*probe: probePid,[^\n]*expect: stalePendingSpawn \}\)/)
  })

  it('reports a REFUSED worktree removal and a FAILED kill as findings, not as successes', () => {
    expect(doctor).toMatch(/const \{ removed, refused \} = removeOrphanWorktrees\(/)
    expect(doctor).toMatch(/REFUSED remove-orphan-worktrees/)
    expect(doctor).toMatch(/const \{ killed, failed \} = killStrayProcesses\(/)
    expect(doctor).toMatch(/FAILED to end pid/)
    // Both must raise the exit code rather than pass silently.
    const between = (from, to) => doctor.slice(doctor.indexOf(from), doctor.indexOf(to))
    expect(between('REFUSED remove-orphan-worktrees', "a.action === 'restore-tasks-from-head'")).toMatch(/alertsRemain = true/)
    expect(between('FAILED to end pid', "a.action === 'restore-tasks-from-head'")).toMatch(/alertsRemain = true/)
  })
})
