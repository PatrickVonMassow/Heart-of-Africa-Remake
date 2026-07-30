// THE BOARD-FIRST GATE, PROVEN BY RUNNING IT.
//
// The pure sweep lives in board-first-core.test.mjs. This suite spawns the real
// wrapper the way the harness spawns it — `node scripts/board-first-guard.mjs`
// with the PreToolUse JSON on stdin — inside an ISOLATED temp repo, because a
// mocked dependency never proves the executed path (retrospective §3.34: a
// command string that was never actually run did the opposite of its intent on
// this platform while fourteen tests stayed green).
//
// What only a spawn can show: the stdin contract, the deny payload's exact
// shape, the fired-once write-through into dashboard-state.json, and the
// promise that an unreadable state never costs the caller a tool call.
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
let repo

const statePath = () => resolve(repo, '.claude', 'dashboard-state.json')
const focusPath = () => resolve(repo, '.claude', 'current-focus.json')
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2))
const readState = () => JSON.parse(readFileSync(statePath(), 'utf8'))

/** Run the guard with a PreToolUse payload; returns { status, stdout, decision }. */
function callGuard(toolName, toolInput = {}) {
  const r = spawnSync(process.execPath, [resolve(repo, 'scripts', 'board-first-guard.mjs')], {
    windowsHide: true,
    cwd: repo,
    encoding: 'utf8',
    input: JSON.stringify({
      session_id: 'board-first-test',
      hook_event_name: 'PreToolUse',
      tool_name: toolName,
      tool_input: toolInput,
    }),
  })
  let decision = null
  try {
    decision = r.stdout.trim() ? JSON.parse(r.stdout.trim()) : null
  } catch {
    /* not a decision payload — the assertions report the raw stdout instead */
  }
  return { ...r, decision }
}

beforeAll(() => {
  repo = mkdtempSync(resolve(tmpdir(), 'hoa-board-first-'))
  cpSync(SOURCE_SCRIPTS, resolve(repo, 'scripts'), {
    recursive: true,
    filter: (src) => !/[\\/](verify|git-hooks)([\\/]|$)/.test(src),
  })
  mkdirSync(resolve(repo, '.claude'), { recursive: true })
})

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true })
})

beforeEach(() => {
  // A turn just started and the focus is older than it — the denying state.
  const now = Date.now()
  writeJson(statePath(), { turnStartedAt: now })
  writeJson(focusPath(), { point: 366, note: 'stale', setAt: now - 60_000, confirmedAt: now - 60_000 })
})

describe('board-first-guard (spawned)', () => {
  it('denies the first mutating call with a well-formed PreToolUse payload', () => {
    const r = callGuard('Write', { file_path: 'src/x.ts' })
    expect(r.status, r.stderr).toBe(0)
    expect(r.decision, `printed ${JSON.stringify(r.stdout)}`).toBeTruthy()
    const out = r.decision.hookSpecificOutput
    expect(out.hookEventName).toBe('PreToolUse')
    expect(out.permissionDecision).toBe('deny')
    expect(out.permissionDecisionReason).toContain('BOARD FIRST')
  })

  it('records that it fired, and stands down for the rest of the turn', () => {
    expect(callGuard('Write', { file_path: 'src/x.ts' }).decision).toBeTruthy()
    expect(readState().boardFirstFiredAt).toBeGreaterThan(0)
    // Second mutating call of the same turn: silent, i.e. allowed.
    const second = callGuard('Bash', { command: 'git commit -m x' })
    expect(second.status).toBe(0)
    expect(second.stdout.trim()).toBe('')
  })

  it('never denies a read or an escape-path command', () => {
    for (const call of [
      ['Read', { file_path: 'src/x.ts' }],
      ['Grep', { pattern: 'x' }],
      ['Bash', { command: 'git status --short' }],
      ['Bash', { command: 'node scripts/focus.mjs confirm' }],
      ['Bash', { command: 'node scripts/dashboard-publish.mjs' }],
      ['Edit', { file_path: '.batch-dashboard.html' }],
    ]) {
      const r = callGuard(call[0], call[1])
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout.trim(), `${call[0]} ${JSON.stringify(call[1])} must be allowed`).toBe('')
    }
  })

  it('allows once the focus is stamped after the turn began', () => {
    const now = Date.now()
    writeJson(statePath(), { turnStartedAt: now - 1000 })
    writeJson(focusPath(), { point: 366, note: 'fresh', setAt: now, confirmedAt: now })
    const r = callGuard('Write', { file_path: 'src/x.ts' })
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('')
  })

  it('fails OPEN on an unparseable state file, on no stdin and on junk stdin', () => {
    writeFileSync(statePath(), '{ this is not json')
    expect(callGuard('Write', { file_path: 'src/x.ts' }).stdout.trim()).toBe('')

    const guard = resolve(repo, 'scripts', 'board-first-guard.mjs')
    const noStdin = spawnSync(process.execPath, [guard], { windowsHide: true, cwd: repo, encoding: 'utf8', input: '' })
    expect(noStdin.status).toBe(0)
    expect(noStdin.stdout.trim()).toBe('')

    const junk = spawnSync(process.execPath, [guard], { windowsHide: true, cwd: repo, encoding: 'utf8', input: 'not json' })
    expect(junk.status).toBe(0)
    expect(junk.stdout.trim()).toBe('')
  })

  it('stands down while the batch is paused', () => {
    const pause = resolve(repo, '.claude', 'batch-paused')
    writeFileSync(pause, '')
    try {
      expect(callGuard('Write', { file_path: 'src/x.ts' }).stdout.trim()).toBe('')
    } finally {
      rmSync(pause, { force: true })
    }
  })

  // --- THE NO-WORK CLAIM (point 470) -----------------------------------------
  // Spawned, because the claim is read from a FILE the wrapper resolves through
  // `dashboardPath` — a pure test can prove the rule but not that the wrapper
  // ever hands it the board.
  describe('a board claiming idleness binds the turn', () => {
    const boardPath = () => resolve(repo, '.batch-dashboard.html')
    const sect = (name, body) => `<details class="sect"><summary><h2>${name}</h2></summary>\n${body}</details>\n`
    const seedBoard = (now) => {
      writeFileSync(
        boardPath(),
        `<main>\n${sect('Woran ich gerade arbeite', now)}${sect('Von dir zu klären', '')}` +
          `${sect('Warteschlange', '')}${sect('Erledigt', '')}</main>\n`,
      )
      const state = readState()
      writeJson(statePath(), { ...state, dashboardPath: '.batch-dashboard.html' })
    }
    const idle =
      '<details class="now">\n  <summary><span class="t">Gerade keine laufende Arbeit</span>' +
      '<span class="right"><span class="meta">22:27</span></span></summary>\n' +
      '  <div class="body">\n    <p>Der Punkt ist abgeschlossen.</p>\n  </div>\n</details>\n'
    const real =
      '<details class="now">\n  <summary><span class="t">470 — Die Tafel</span>' +
      '<span class="right"><span class="meta">22:30 · ~23:00</span></span></summary>\n' +
      '  <div class="body">\n    <p>läuft</p>\n  </div>\n</details>\n'

    afterEach(() => rmSync(boardPath(), { force: true }))

    it('denies a state-changing call and says how to put it right', () => {
      seedBoard(idle)
      const r = callGuard('Bash', { command: 'git commit -m x' })
      expect(r.status, r.stderr).toBe(0)
      const reason = r.decision.hookSpecificOutput.permissionDecisionReason
      expect(reason).toContain('THE BOARD CLAIMS NOTHING IS RUNNING')
      expect(reason).toContain('node scripts/board.mjs now')
    })

    it('keeps denying — it must not stand down and leave the lie up for the turn', () => {
      seedBoard(idle)
      expect(callGuard('Bash', { command: 'git commit -m x' }).decision).toBeTruthy()
      expect(callGuard('Bash', { command: 'npm run test:unit' }).decision).toBeTruthy()
      // …and it did not spend the once-per-turn budget of the ordinary deny.
      expect(readState().boardFirstFiredAt ?? 0).toBe(0)
    })

    it('lets the session-ending path and every read through', () => {
      seedBoard(idle)
      for (const call of [
        ['Bash', { command: 'node scripts/batch-boundary.mjs 470' }],
        ['Bash', { command: 'node scripts/board.mjs none --text-stdin' }],
        ['Read', { file_path: 'src/x.ts' }],
      ]) {
        const r = callGuard(call[0], call[1])
        expect(r.status, r.stderr).toBe(0)
        expect(r.stdout.trim(), `${call[0]} ${JSON.stringify(call[1])} must be allowed`).toBe('')
      }
    })

    it('lets the two MEASURED reads through (point 473), on the executed path', () => {
      // Both were denied live on 30.07.2026: a `>` inside a quoted grep pattern,
      // and `worktree` read as a verb rather than as a subcommand of `list`.
      seedBoard(idle)
      for (const command of [
        'git worktree list',
        'grep -c "<span class=\\"now\\">" .batch-dashboard.html',
        'node scripts/focus.mjs confirm && node scripts/board-publish.mjs',
      ]) {
        const r = callGuard('Bash', { command })
        expect(r.status, r.stderr).toBe(0)
        expect(r.stdout.trim(), `${command} must be allowed`).toBe('')
      }
    })

    it('names the state-changing SEGMENT of a chain in its deny', () => {
      seedBoard(idle)
      const r = callGuard('Bash', { command: 'git status --short && npm run build' })
      expect(r.decision.hookSpecificOutput.permissionDecisionReason).toContain(
        'The segment that changes state: `npm run build`',
      )
    })

    it('falls back to the ordinary board-first deny once a real card stands', () => {
      seedBoard(real)
      const reason = callGuard('Bash', { command: 'git commit -m x' }).decision.hookSpecificOutput
        .permissionDecisionReason
      expect(reason).toContain('BOARD FIRST')
      expect(reason).not.toContain('THE BOARD CLAIMS NOTHING IS RUNNING')
    })
  })

  // --- THE FENCE CHOKEPOINT (point 434) --------------------------------------
  // Spawned, not mocked: this gate's whole promise is that a session which lost
  // the batch cannot go on writing shared state, and a promise about the executed
  // path has to be shown on the executed path.
  const SID = 'board-first-test' // the session id callGuard sends
  const fencePath = () => resolve(repo, '.claude', 'batch-fence.json')
  /** `held` for our session, and the mark since moved to `current`. */
  const seedFence = (held, current, holder = 'the-successor') =>
    writeJson(fencePath(), {
      v: 1,
      fence: current,
      holder,
      at: Date.now(),
      holders: [
        { sessionId: SID, fence: held, at: Date.now() - 60_000 },
        { sessionId: holder, fence: current, at: Date.now() },
      ],
    })
  const denial = (r) => (r.decision ? r.decision.hookSpecificOutput.permissionDecisionReason : '')

  it('§8 chokepoint: a STALE-fence session is refused a push, a tick, a board publish and a state merge', () => {
    // THE NIGHT OF 29./30.07.2026, at the point where it does damage: the woken
    // owner still pushes to main. Without this the fence would protect only the
    // file that was already protected.
    seedFence(7, 8)
    try {
      for (const call of [
        ['Bash', { command: 'git push origin HEAD:main' }],
        ['Bash', { command: 'git merge --no-ff feat/x' }],
        ['Edit', { file_path: 'TASKS.md' }],
        ['Edit', { file_path: 'docs/tasks-archive.md' }],
        ['Bash', { command: 'node scripts/board-publish.mjs' }],
        ['Bash', { command: 'node scripts/focus.mjs confirm' }],
        ['Write', { file_path: '.claude/dashboard-state.json' }],
      ]) {
        const r = callGuard(call[0], call[1])
        expect(r.status, r.stderr).toBe(0)
        expect(denial(r), `${call[0]} ${JSON.stringify(call[1])} must be REFUSED`).toContain('FENCED OUT')
      }
    } finally {
      rmSync(fencePath(), { force: true })
    }
  })

  it('a wrapper hides nothing from the fence, on the executed path (point 473)', () => {
    // The head-based classifier must not undo what the old string regexes did by
    // accident: a dispossessed session moving shared history through `bash -c`,
    // `eval` or a command substitution.
    seedFence(7, 8)
    try {
      for (const command of ['bash -c "git push origin main"', 'eval "git push"', 'echo $(git push)']) {
        expect(denial(callGuard('Bash', { command })), `${command} must be REFUSED`).toContain('FENCED OUT')
      }
      // …while a wrapped READ still goes through.
      expect(denial(callGuard('Bash', { command: 'bash -c "git status --short"' }))).not.toContain('FENCED OUT')
    } finally {
      rmSync(fencePath(), { force: true })
    }
  })

  it('the refusal repeats — it is a correctness gate, not a once-per-turn nudge', () => {
    // The board-first deny stands down after firing once, so a session that
    // ignores it can still work. This one must NOT: repeating the push is exactly
    // what the dispossessed owner would do.
    seedFence(7, 8)
    try {
      expect(denial(callGuard('Bash', { command: 'git push' }))).toContain('FENCED OUT')
      expect(denial(callGuard('Bash', { command: 'git push' }))).toContain('FENCED OUT')
    } finally {
      rmSync(fencePath(), { force: true })
    }
  })

  it('§8 chokepoint: a CURRENT-fence session is refused none of them', () => {
    writeJson(fencePath(), { v: 1, fence: 8, holder: SID, at: Date.now(), holders: [{ sessionId: SID, fence: 8, at: Date.now() }] })
    try {
      // Fresh focus so the board-first rule allows too — this asserts the FENCE.
      const now = Date.now()
      writeJson(statePath(), { turnStartedAt: now - 1000 })
      writeJson(focusPath(), { point: 434, note: 'fresh', setAt: now, confirmedAt: now })
      for (const call of [
        ['Bash', { command: 'git push origin main' }],
        ['Edit', { file_path: 'TASKS.md' }],
        ['Bash', { command: 'node scripts/board-publish.mjs' }],
      ]) {
        const r = callGuard(call[0], call[1])
        expect(r.stdout.trim(), `${call[0]} must be allowed`).toBe('')
      }
    } finally {
      rmSync(fencePath(), { force: true })
    }
  })

  it('a session that NEVER held a fence is never blocked, whatever the mark says', () => {
    // The over-blocking direction is the expensive one: a block-loop cost this
    // project ~30 turns once. An attended window has no grant on record.
    writeJson(fencePath(), { v: 1, fence: 99, holder: 'someone-else', at: Date.now(), holders: [{ sessionId: 'someone-else', fence: 99, at: Date.now() }] })
    try {
      expect(denial(callGuard('Bash', { command: 'git push origin main' }))).not.toContain('FENCED OUT')
    } finally {
      rmSync(fencePath(), { force: true })
    }
  })

  it('leaves a fenced-out session everything OUTSIDE the four families', () => {
    seedFence(7, 8)
    try {
      for (const call of [
        ['Bash', { command: 'git commit -m "still my work"' }],
        ['Bash', { command: 'git status --short' }],
        ['Read', { file_path: 'TASKS.md' }],
        ['Edit', { file_path: 'src/world/world.ts' }],
      ]) {
        expect(denial(callGuard(call[0], call[1])), `${call[0]} must not be fenced`).not.toContain('FENCED OUT')
      }
    } finally {
      rmSync(fencePath(), { force: true })
    }
  })

  it('INDEPENDENCE + fail-open: a stale fence still refuses with NO lock and NO state; a torn one refuses nothing', () => {
    // The fence file is the only input this gate needs — deliberately, because on
    // the lost night every other local signal was missing or stale.
    seedFence(7, 8)
    rmSync(statePath(), { force: true })
    rmSync(resolve(repo, '.claude', 'batch-lock.json'), { force: true })
    try {
      expect(denial(callGuard('Bash', { command: 'git push' }))).toContain('FENCED OUT')
      writeFileSync(fencePath(), '{ torn')
      const r = callGuard('Bash', { command: 'git push' })
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout.trim()).toBe('')
    } finally {
      rmSync(fencePath(), { force: true })
    }
  })

  it('stands down for a PAUSED batch, fence or no fence', () => {
    seedFence(7, 8)
    const pause = resolve(repo, '.claude', 'batch-paused')
    writeFileSync(pause, '')
    try {
      expect(callGuard('Bash', { command: 'git push origin main' }).stdout.trim()).toBe('')
    } finally {
      rmSync(pause, { force: true })
      rmSync(fencePath(), { force: true })
    }
  })

  it('RENEWS THE LEASE BEFORE THE CALL — for the owner, and never for a stranger', () => {
    // The renewal must happen in PreToolUse: the PostToolUse heartbeat fires when
    // a call RETURNS, so a lease renewed there would have to outlive the longest
    // single call (this repo runs 40-minute suites).
    const lockPath = resolve(repo, '.claude', 'batch-lock.json')
    const claimedAt = Date.now() - 30 * 60_000
    writeJson(lockPath, { v: 2, sessionId: SID, claimedAt, leaseUntil: Date.now() - 60_000, pid: process.pid })
    try {
      callGuard('Bash', { command: 'git status' })
      const after = JSON.parse(readFileSync(lockPath, 'utf8'))
      expect(after.leaseUntil).toBeGreaterThan(Date.now())
      expect(after.claimedAt, 'a renewal must not stamp claimedAt — that withdraws a handover').toBe(claimedAt)

      // A stranger's call renews nothing.
      const strangerLock = { v: 2, sessionId: 'someone-else', claimedAt, leaseUntil: Date.now() - 60_000, pid: process.pid }
      writeJson(lockPath, strangerLock)
      callGuard('Bash', { command: 'git status' })
      expect(JSON.parse(readFileSync(lockPath, 'utf8')).leaseUntil).toBe(strangerLock.leaseUntil)
    } finally {
      rmSync(lockPath, { force: true })
    }
  })

  it('--status reports the verdict without a tool call', () => {
    const r = spawnSync(process.execPath, [resolve(repo, 'scripts', 'board-first-guard.mjs'), '--status'], {
      windowsHide: true,
      cwd: repo,
      encoding: 'utf8',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('verdict for a mutating call: DENY')
  })
})
