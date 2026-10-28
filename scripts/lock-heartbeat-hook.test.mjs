// The DUE MARK, proven by running the hook (point 400, delta A).
//
// The mark rides on the PostToolUse hook that already runs on every call, so a
// pure test of the decision is not enough: what must hold is that the spawned
// hook actually writes it. Each case runs `node scripts/lock-heartbeat-hook.mjs`
// the way the harness does — the hook payload on stdin — against an ISOLATED
// temp repo (a copy of scripts/ plus a file skeleton), so REPO_ROOT is the temp
// dir and this suite can never touch the real state file.
//
// The SAME hook's other spawned duty — the chat delivery of point 406, whose
// token rule is likewise only provable on a real stdout — lives in
// scripts/chat-delivery-hook.test.mjs. It is a separate file because every case
// here blocks its worker inside a `spawnSync`: fifteen of them in one file
// starved the Vitest pool into a "Timeout calling onTaskUpdate", a green run
// with a red exit code. Add spawned cases sparingly, and to one file or the
// other rather than piling them up in one.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { openSetFingerprint } from './board-currency-core.mjs'
import { berlinStamp, evaluate, headerReading } from './timestamp-guard-core.mjs'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
let repo

const tasks = (points) =>
  ['# Work order', '', ...points.map((n) => `- [ ] ${n}. Something to do`), ''].join('\n')

const writeTasks = (points) => writeFileSync(resolve(repo, 'TASKS.md'), tasks(points))

const runHook = (payload = {}) =>
  spawnSync(process.execPath, [resolve(repo, 'scripts', 'lock-heartbeat-hook.mjs')], {
    windowsHide: true,
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

// DUTY (13), THE REPLY HEADER (point 1308, U1): the header the timestamp Stop
// guard will expect, delivered as PostToolUse context — change-only, never for a
// subagent, and never at the cost of another duty or of the tool call.
describe('lock-heartbeat-hook — the reply header (duty 13)', () => {
  const transcript = () => {
    const path = resolve(repo, 'transcript.jsonl')
    writeFileSync(path, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 123456 } } })}\n`)
    return path
  }
  const headerOf = (stdout) => {
    const lines = String(stdout).split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)
    const context = JSON.parse(lines[0]).hookSpecificOutput.additionalContext
    expect(context.startsWith('[reply-header] Current reply header: ')).toBe(true)
    return context.slice('[reply-header] Current reply header: '.length)
  }
  const seedHeader = (record) => {
    const s = state() ?? {}
    writeFileSync(resolve(repo, '.claude', 'dashboard-state.json'), JSON.stringify({ ...s, replyHeader: record }, null, 2))
  }

  it('hands over exactly the header the timestamp guard accepts, through the shared headerReading', () => {
    const path = transcript()
    const before = berlinStamp()
    const r = runHook({ session_id: 'hdr-a', tool_name: 'Read', tool_input: { file_path: 'x' }, transcript_path: path })
    expect(r.status).toBe(0)
    const header = headerOf(r.stdout)
    const { suffix } = headerReading(path)
    expect(suffix).toBe(' · Kontext: 123.456 Tokens')
    expect([`**${before}**${suffix}`, `**${berlinStamp()}**${suffix}`]).toContain(header)
    expect(evaluate({ lastText: `${header}\n\ntext`, headerSuffix: suffix, enforceSuffix: true })).toBeNull()
  })

  it('is not sent again within the same minute and reading bucket', () => {
    const path = transcript()
    for (let attempt = 0; attempt < 2; attempt++) {
      const stamp = berlinStamp()
      seedHeader({ sessionId: 'hdr-b', stamp, bucket: 12 })
      const r = runHook({ session_id: 'hdr-b', tool_name: 'Read', tool_input: { file_path: 'x' }, transcript_path: path })
      if (berlinStamp() !== stamp) continue // the minute rolled over mid-case; ask again
      expect(r.stdout).toBe('')
      return
    }
  })

  it('is sent again once the minute changed', () => {
    const path = transcript()
    seedHeader({ sessionId: 'hdr-c', stamp: 'Montag, 01.01.2001, 00:00', bucket: 12 })
    const r = runHook({ session_id: 'hdr-c', tool_name: 'Read', tool_input: { file_path: 'x' }, transcript_path: path })
    expect(headerOf(r.stdout)).toContain(' · Kontext: 123.456 Tokens')
    expect(state().replyHeader).toEqual(expect.objectContaining({ sessionId: 'hdr-c', bucket: 12 }))
  })

  it('carries the honest `--` reading for a missing transcript or one without a usage row', () => {
    const missing = runHook({ session_id: 'hdr-d', tool_name: 'Read', tool_input: { file_path: 'x' }, transcript_path: resolve(repo, 'nope.jsonl') })
    expect(headerOf(missing.stdout).endsWith('** · Kontext: -- Tokens')).toBe(true)
    const bare = resolve(repo, 'bare.jsonl')
    writeFileSync(bare, `${JSON.stringify({ type: 'user', message: { content: 'hi' } })}\n`)
    const noUsage = runHook({ session_id: 'hdr-e', tool_name: 'Read', tool_input: { file_path: 'x' }, transcript_path: bare })
    expect(headerOf(noUsage.stdout).endsWith('** · Kontext: -- Tokens')).toBe(true)
  })

  it('says nothing to a subagent', () => {
    const r = runHook({ session_id: 'hdr-f', agent_id: 'a1', tool_name: 'Read', tool_input: { file_path: 'x' }, transcript_path: transcript() })
    expect(r.stdout).toBe('')
  })

  it('duty (9) marks its envelope as spoken, and the header waits behind every speaking duty', () => {
    // Source order is the contract: (6), (7) and (9) set `spoke`, (13) runs last on `!spoke`.
    const src = readFileSync(resolve(SOURCE_SCRIPTS, 'lock-heartbeat-hook.mjs'), 'utf8')
    const duty9 = src.indexOf('const observed = observeOwnerLoops({')
    const duty9Spoke = src.indexOf('spoke = true', duty9)
    const duty13 = src.indexOf('const delivery = headerDelivery({')
    expect(duty9).toBeGreaterThan(0)
    expect(duty9Spoke).toBeGreaterThan(duty9)
    expect(duty9Spoke).toBeLessThan(duty13)
    expect(src.slice(duty9Spoke - 400, duty13)).toContain('if (!spoke && !isSubagentHook(data))')
  })
})

describe('lock-heartbeat-hook — a failing header delivery changes nothing else', () => {
  let broken
  beforeAll(() => {
    broken = mkdtempSync(resolve(tmpdir(), 'hoa-header-throw-'))
    mkdirSync(resolve(broken, '.claude'), { recursive: true })
    mkdirSync(resolve(broken, 'docs'), { recursive: true })
    cpSync(SOURCE_SCRIPTS, resolve(broken, 'scripts'), { recursive: true })
    writeFileSync(resolve(broken, 'docs', 'tasks-archive.md'), '- [x] 1. done\n')
    writeFileSync(resolve(broken, 'TASKS.md'), tasks([10, 20]))
    // ICU gone: the copied core's stamp throws.
    const core = resolve(broken, 'scripts', 'timestamp-guard-core.mjs')
    const text = readFileSync(core, 'utf8')
    const head = 'export function berlinStamp(date = new Date()) {'
    expect(text).toContain(head)
    writeFileSync(core, text.replace(head, `${head}\n  throw new Error('ICU gone')`))
  })
  afterAll(() => {
    try {
      rmSync(broken, { recursive: true, force: true })
    } catch {
      /* a temp dir left behind is harmless */
    }
  })

  it('exits 0 with one stderr line, and the heartbeat and publish-due duties still write', () => {
    const r = spawnSync(process.execPath, [resolve(broken, 'scripts', 'lock-heartbeat-hook.mjs')], {
      windowsHide: true,
      encoding: 'utf8',
      cwd: broken,
      input: JSON.stringify({ session_id: 'hdr-throw', hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: 'x' } }),
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain('header-inject failed: ICU gone')
    const dash = JSON.parse(readFileSync(resolve(broken, '.claude', 'dashboard-state.json'), 'utf8'))
    expect(dash.openFingerprint).toBe(openSetFingerprint([10, 20]))
    expect(dash.replyHeader).toBeUndefined()
    const activity = JSON.parse(readFileSync(resolve(broken, '.claude', 'tool-activity.json'), 'utf8'))
    expect(activity.sessionId).toBe('hdr-throw')
  })
})
