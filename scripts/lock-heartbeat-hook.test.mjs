// The DUE MARK, proven by running the hook (point 400, delta A).
//
// The mark rides on the PostToolUse hook that already runs on every call, so a
// pure test of the decision is not enough: what must hold is that the spawned
// hook actually writes it. Each case runs `node scripts/lock-heartbeat-hook.mjs`
// the way the harness does — the hook payload on stdin — against an ISOLATED
// temp repo (a copy of scripts/ plus a file skeleton), so REPO_ROOT is the temp
// dir and this suite can never touch the real state file.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
