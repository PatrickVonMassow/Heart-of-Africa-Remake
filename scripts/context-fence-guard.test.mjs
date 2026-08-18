// THE CONTEXT FENCE, PROVEN BY RUNNING IT.
//
// The pure decision lives in context-fence-core.test.mjs. This suite spawns the
// real wrapper the way the harness spawns it — `node
// scripts/context-fence-guard.mjs` with the PreToolUse JSON on stdin — inside an
// isolated temp repo, because a mocked dependency never proves the executed
// path. What only a spawn can show: the stdin contract, the transcript
// measurement through the payload's transcript_path, the owner-only binding,
// the worktree stand-down and the fail-open promises.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
const SID = 'context-fence-test'
let repo

const lockPath = () => resolve(repo, '.claude', 'batch-lock.json')
const transcriptPath = () => resolve(repo, 'transcript.jsonl')
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value))

/** One JSONL transcript whose newest usage record reports `tokens` context. */
const writeTranscript = (tokens) =>
  writeFileSync(
    transcriptPath(),
    [
      JSON.stringify({ type: 'user', message: { role: 'user' } }),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        message: { usage: { input_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      }),
    ].join('\n') + '\n',
  )

function callGuard(toolName, toolInput = {}, { guardPath, sessionId = SID, transcript } = {}) {
  const r = spawnSync(process.execPath, [guardPath ?? resolve(repo, 'scripts', 'context-fence-guard.mjs')], {
    windowsHide: true,
    cwd: repo,
    encoding: 'utf8',
    input: JSON.stringify({
      session_id: sessionId,
      hook_event_name: 'PreToolUse',
      transcript_path: transcript ?? transcriptPath(),
      tool_name: toolName,
      tool_input: toolInput,
    }),
  })
  let decision = null
  try {
    decision = r.stdout.trim() ? JSON.parse(r.stdout.trim()) : null
  } catch {
    /* not a decision payload — assertions report raw stdout */
  }
  return { ...r, decision }
}

const denial = (r) => (r.decision ? r.decision.hookSpecificOutput.permissionDecisionReason : '')

beforeAll(() => {
  repo = mkdtempSync(resolve(tmpdir(), 'hoa-context-fence-'))
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
  writeJson(lockPath(), { v: 2, sessionId: SID, claimedAt: Date.now(), pid: process.pid })
  writeTranscript(434_440) // past the 150k mark
})

describe('context-fence-guard (spawned)', () => {
  it('denies a starting call for the owner past the mark, with the measurement in the reason', () => {
    const r = callGuard('Agent', { prompt: 'build point 701' })
    expect(r.status, r.stderr).toBe(0)
    const out = r.decision?.hookSpecificOutput
    expect(out, `printed ${JSON.stringify(r.stdout)}`).toBeTruthy()
    expect(out.hookEventName).toBe('PreToolUse')
    expect(out.permissionDecision).toBe('deny')
    expect(out.permissionDecisionReason).toContain('434440')
    expect(out.permissionDecisionReason).toContain('batch-boundary.mjs --prepare --context')
  })

  it('the deny REPEATS — it is a fence, not a once-per-turn nudge', () => {
    expect(denial(callGuard('Bash', { command: 'npm test' }))).toContain('WATERMARK')
    expect(denial(callGuard('Bash', { command: 'npm test' }))).toContain('WATERMARK')
  })

  it('denies a Task spawn like an Agent spawn — the arming matcher must carry both', () => {
    expect(denial(callGuard('Task', { prompt: 'build point 701' }))).toContain('WATERMARK')
  })

  it('denies a suite start through a SYMLINK to the verify tree — the real resolver is wired (Sol round 4)', () => {
    // The temp-repo copy excludes scripts/verify; give it a real target so
    // realpathSync in the spawned guard resolves through the link.
    const verifyDir = resolve(repo, 'scripts', 'verify')
    const link = resolve(repo, 'verify-link')
    mkdirSync(verifyDir, { recursive: true })
    writeFileSync(resolve(verifyDir, 'world.mjs'), '// stub suite for the symlink pin\n')
    try {
      try {
        symlinkSync(verifyDir, link, 'dir')
      } catch {
        return // a filesystem without symlink rights cannot host this evasion
      }
      expect(denial(callGuard('Bash', { command: 'node verify-link/world.mjs' }))).toContain('WATERMARK')
    } finally {
      rmSync(link, { force: true })
      rmSync(verifyDir, { recursive: true, force: true })
    }
  })

  it('lets every finishing call and read through past the mark', () => {
    for (const [tool, input] of [
      ['Bash', { command: 'git commit -m "finish"' }],
      ['Bash', { command: 'git push origin feat/x' }],
      ['Bash', { command: 'node scripts/batch-boundary.mjs --prepare --context' }],
      ['Bash', { command: 'node scripts/board-publish.mjs' }],
      ['Bash', { command: 'npm run test:unit' }],
      ['Edit', { file_path: 'src/world/world.ts' }],
      ['Read', { file_path: 'TASKS.md' }],
    ]) {
      const r = callGuard(tool, input)
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout.trim(), `${tool} ${JSON.stringify(input)} must be allowed`).toBe('')
    }
  })

  it('allows everything below the mark', () => {
    writeTranscript(90_000)
    expect(callGuard('Agent', {}).stdout.trim()).toBe('')
    expect(callGuard('Bash', { command: 'npm test' }).stdout.trim()).toBe('')
  })

  it('fails OPEN on an unreadable measurement — a missing transcript denies nothing', () => {
    const r = callGuard('Agent', {}, { transcript: resolve(repo, 'no-such-transcript.jsonl') })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout.trim()).toBe('')
  })

  it('binds ONLY the batch owner — a foreign or absent lock passes', () => {
    expect(callGuard('Agent', {}, { sessionId: 'some-other-window' }).stdout.trim()).toBe('')
    rmSync(lockPath(), { force: true })
    expect(callGuard('Agent', {}).stdout.trim()).toBe('')
  })

  it('stands down for a paused batch', () => {
    const pause = resolve(repo, '.claude', 'batch-paused')
    writeFileSync(pause, '')
    try {
      expect(callGuard('Agent', {}).stdout.trim()).toBe('')
    } finally {
      rmSync(pause, { force: true })
    }
  })

  it('stands down in a worktree checkout — a delegated agent is never fenced on its parent id', () => {
    const wt = resolve(repo, '.claude', 'worktrees', 'agent-x')
    cpSync(resolve(repo, 'scripts'), resolve(wt, 'scripts'), { recursive: true })
    mkdirSync(resolve(wt, '.claude'), { recursive: true })
    writeJson(resolve(wt, '.claude', 'batch-lock.json'), { v: 2, sessionId: SID, claimedAt: Date.now(), pid: process.pid })
    const r = callGuard('Agent', {}, { guardPath: resolve(wt, 'scripts', 'context-fence-guard.mjs') })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout.trim()).toBe('')
  })

  it('fails OPEN on no stdin and on junk stdin', () => {
    const guard = resolve(repo, 'scripts', 'context-fence-guard.mjs')
    for (const input of ['', 'not json']) {
      const r = spawnSync(process.execPath, [guard], { windowsHide: true, cwd: repo, encoding: 'utf8', input })
      expect(r.status).toBe(0)
      expect(r.stdout.trim()).toBe('')
    }
  })

  it('--status reports the measurement and the starting-call verdict', () => {
    const r = spawnSync(
      process.execPath,
      [resolve(repo, 'scripts', 'context-fence-guard.mjs'), '--status', '--transcript', transcriptPath()],
      { windowsHide: true, cwd: repo, encoding: 'utf8' },
    )
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('"state": "past"')
    expect(r.stdout).toContain('verdict for a STARTING call')
    expect(r.stdout).toContain('DENY')
  })
})
