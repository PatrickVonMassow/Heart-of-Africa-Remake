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
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
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
