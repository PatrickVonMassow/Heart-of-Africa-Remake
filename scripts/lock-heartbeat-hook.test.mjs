// THE HOOK ITSELF, SPAWNED (point 400 delta A; point 406).
//
// Both duties proved here ride on the PostToolUse hook that already runs on
// every tool call, so a pure test of the decision is not enough: what must hold
// is that the SPAWNED hook writes the due mark — and, for the chat delivery,
// that it writes the injection JSON when a message waits and NOTHING WHATSOEVER
// when none does. That token rule is only enforceable at this level, where
// stdout is a real byte count rather than a return value.
//
// Each case runs `node scripts/lock-heartbeat-hook.mjs` the way the harness does
// — the hook payload on stdin — against an ISOLATED temp repo (a copy of
// scripts/ plus a file skeleton), so REPO_ROOT is the temp dir and this suite
// can never touch the real state file.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { openSetFingerprint } from './board-currency-core.mjs'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
let repo

const tasks = (points) =>
  ['# Work order', '', ...points.map((n) => `- [ ] ${n}. Something to do`), ''].join('\n')

const writeTasks = (points) => writeFileSync(resolve(repo, 'TASKS.md'), tasks(points))

const runHook = (payload = {}) =>
  spawnSync(process.execPath, [resolve(repo, 'scripts', 'lock-heartbeat-hook.mjs')], {
    encoding: 'utf8',
    cwd: repo,
    input: JSON.stringify({ session_id: 'due-mark-session', hook_event_name: 'PostToolUse', ...payload }),
  })

const state = () => {
  try {
    return JSON.parse(readFileSync(resolve(repo, '.claude', 'dashboard-state.json'), 'utf8'))
  } catch {
    return null
  }
}

beforeAll(() => {
  repo = mkdtempSync(resolve(tmpdir(), 'hoa-due-mark-'))
  mkdirSync(resolve(repo, '.claude'), { recursive: true })
  mkdirSync(resolve(repo, 'docs'), { recursive: true })
  cpSync(SOURCE_SCRIPTS, resolve(repo, 'scripts'), { recursive: true })
  writeFileSync(resolve(repo, 'docs', 'tasks-archive.md'), '- [x] 1. done\n')
  writeTasks([10, 20])
})

afterAll(() => {
  try {
    rmSync(repo, { recursive: true, force: true })
  } catch {
    /* windows may still hold a handle — a temp dir left behind is harmless */
  }
})

describe('lock-heartbeat-hook — the board-publish due mark', () => {
  it('records the first observation of the open set WITHOUT demanding a publish', () => {
    const r = runHook({ tool_name: 'Read', tool_input: { file_path: 'x.ts' } })
    expect(r.status).toBe(0)
    expect(state().openFingerprint).toBe(openSetFingerprint([10, 20]))
    expect(state().publishDue).toBeUndefined()
  })

  it('writes nothing new while the work order is unchanged', () => {
    runHook({ tool_name: 'Read', tool_input: { file_path: 'x.ts' } })
    expect(state().publishDue).toBeUndefined()
  })

  it('marks a publish DUE when a point is appended', () => {
    writeTasks([10, 20, 30])
    runHook({ tool_name: 'Bash', tool_input: { command: 'git merge feat/x' } })
    expect(state().publishDue).toBeTruthy()
    expect(state().publishDue.fingerprint).toBe(openSetFingerprint([10, 20, 30]))
  })

  it('marks a publish DUE when a point is ticked away (the archive move)', () => {
    // Clear the standing mark the way a publish would, then tick a point.
    const s = state()
    writeFileSync(
      resolve(repo, '.claude', 'dashboard-state.json'),
      JSON.stringify({ ...s, publishDue: undefined, publishedFingerprint: s.openFingerprint }, null, 2),
    )
    writeTasks([10, 30])
    runHook({ tool_name: 'Bash', tool_input: { command: 'git commit -m tick' } })
    expect(state().publishDue.fingerprint).toBe(openSetFingerprint([10, 30]))
  })

  it('CLEARS the mark once the live board carries the same set', () => {
    const s = state()
    writeFileSync(
      resolve(repo, '.claude', 'dashboard-state.json'),
      JSON.stringify({ ...s, publishedFingerprint: s.openFingerprint, tasksSeenMtime: 0 }, null, 2),
    )
    runHook({ tool_name: 'Read', tool_input: { file_path: 'x.ts' } })
    expect(state().publishDue).toBeUndefined()
  })

  it('records that this session HAS the Artifact tool', () => {
    runHook({ tool_name: 'Artifact', tool_input: { action: 'list' }, tool_response: 'ok' })
    expect(state().artifactToolSeen).toEqual(
      expect.objectContaining({ sessionId: 'due-mark-session' }),
    )
  })

  it('never fails a tool call, even with no work order at all', () => {
    rmSync(resolve(repo, 'TASKS.md'))
    const r = runHook({ tool_name: 'Read', tool_input: { file_path: 'x.ts' } })
    expect(r.status).toBe(0)
    writeTasks([10, 30])
  })
})

// --- THE CHAT DELIVERY (point 406) -------------------------------------------
//
// THE TOKEN RULE IS THE ACCEPTANCE-CRITICAL ONE, and only a spawned hook can
// prove it: injected context is re-sent with every later request, so an empty
// spool must produce zero bytes on stdout — not an empty JSON object, not a
// newline. `toBe('')` is the assertion the rule reduces to.
describe('lock-heartbeat-hook — the user message at the next tool call', () => {
  const LOCK = () => resolve(repo, '.claude', 'batch-lock.json')
  const SPOOL = () => resolve(repo, '.claude', 'chat-spool')
  const CONSUMED = () => resolve(SPOOL(), 'consumed')
  const call = { tool_name: 'Read', tool_input: { file_path: 'x.ts' } }

  const own = (sessionId = 'due-mark-session') =>
    writeFileSync(
      LOCK(),
      // pid is set so the heartbeat never walks for an ancestor: this suite must
      // not spawn a PowerShell round trip, and the walk is irrelevant here.
      JSON.stringify({ v: 2, sessionId, pid: process.pid, pidStartedAt: Date.now(), claimedAt: Date.now() }, null, 2),
    )

  const spool = (message) => {
    mkdirSync(SPOOL(), { recursive: true })
    writeFileSync(resolve(SPOOL(), `${message.ntfyId}.json`), JSON.stringify(message))
  }

  const message = (over = {}) => ({
    id: 'm1',
    ntfyId: 'n1',
    ts: 1_700_000_000_000,
    receivedAt: 1_700_000_000_000,
    text: 'bitte v0.3 vorbereiten',
    ...over,
  })

  const pendingFiles = () => {
    try {
      return readdirSync(SPOOL()).filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }
  }

  afterAll(() => {
    rmSync(LOCK(), { force: true })
    rmSync(SPOOL(), { recursive: true, force: true })
  })

  it('writes NOTHING AT ALL when there is no spool — the token rule', () => {
    own()
    rmSync(SPOOL(), { recursive: true, force: true })
    const r = runHook(call)
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })

  it('writes NOTHING AT ALL when the spool is there but empty', () => {
    own()
    mkdirSync(SPOOL(), { recursive: true })
    const r = runHook(call)
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })

  it('delivers a waiting message as the additionalContext JSON, and consumes it', () => {
    own()
    spool(message())
    const r = runHook(call)
    expect(r.status).toBe(0)
    const parsed = JSON.parse(r.stdout)
    expect(parsed).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: expect.stringContaining('bitte v0.3 vorbereiten'),
      },
    })
    expect(pendingFiles()).toEqual([])
    expect(existsSync(resolve(CONSUMED(), 'n1.json'))).toBe(true)
  })

  it('says nothing at the NEXT call — the same message is never injected twice', () => {
    own()
    const r = runHook(call)
    expect(r.stdout).toBe('')
  })

  it('stands down for a session that does not own the batch, and consumes nothing', () => {
    own('somebody-else')
    spool(message({ id: 'm2', ntfyId: 'n2', text: 'nicht fuer diese Sitzung' }))
    const r = runHook(call)
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
    expect(pendingFiles()).toEqual(['n2.json'])
  })

  it('stands down while the batch is paused, and consumes nothing', () => {
    own()
    const paused = resolve(repo, '.claude', 'batch-paused')
    writeFileSync(paused, '')
    const r = runHook(call)
    expect(r.stdout).toBe('')
    expect(pendingFiles()).toEqual(['n2.json'])
    rmSync(paused, { force: true })
  })

  it('delivers that same message once the pause is lifted', () => {
    own()
    const r = runHook(call)
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toContain('nicht fuer diese Sitzung')
    expect(pendingFiles()).toEqual([])
  })

  it('never fails a tool call over a corrupt spool, and stays silent', () => {
    own()
    mkdirSync(SPOOL(), { recursive: true })
    writeFileSync(resolve(SPOOL(), 'n3.json'), 'not json at all')
    const r = runHook(call)
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })
})
