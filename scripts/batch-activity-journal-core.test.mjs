import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { ACTIVITY_EVENTS, activityRecord, parseActivityJournal } from './batch-activity-journal-core.mjs'
import { activityJournalPath, appendActivity, emitActivity } from './batch-activity-journal.mjs'

const dirs = []
const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-activity-journal-'))
  dirs.push(dir)
  return join(dir, 'journal.jsonl')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('batch activity journal records', () => {
  it('carries every required identity and evidence field explicitly', () => {
    expect(activityRecord({
      seq: 7,
      at: Date.parse('2026-08-21T08:15:29.000Z'),
      event: ACTIVITY_EVENTS.CI_WAIT_START,
      session: '6a0621ed',
      point: 809,
      pid: 42,
      pidStartedAt: 1000,
      generation: 19,
      cause: 'workflow-running',
      evidence: { runId: 32462093487 },
    })).toEqual({
      v: 1,
      seq: 7,
      at: '2026-08-21T08:15:29.000Z',
      atMs: Date.parse('2026-08-21T08:15:29.000Z'),
      event: 'ci-wait-start',
      session: '6a0621ed',
      point: 809,
      pid: 42,
      pidStartedAt: 1000,
      generation: 19,
      cause: 'workflow-running',
      evidence: { runId: 32462093487 },
    })
  })

  it('rejects torn and malformed lines instead of treating them as evidence', () => {
    const valid = activityRecord({ seq: 1, at: 1, event: ACTIVITY_EVENTS.PAUSE, cause: 'user', evidence: {} })
    const parsed = parseActivityJournal(`${JSON.stringify(valid)}\n{"v":1\n{}\n`)
    expect(parsed.records).toEqual([valid])
    expect(parsed.rejected).toEqual([
      { line: 2, reason: 'invalid-json' },
      { line: 3, reason: 'invalid-record' },
    ])
  })
})

describe('batch activity journal append protocol', () => {
  it('routes linked worktrees to the main checkout journal', () => {
    expect(activityJournalPath({
      repo: '/main/.claude/worktrees/point',
      exec: () => '/main/.git\n',
    })).toBe(join('/main', '.claude', 'batch-activity.jsonl'))
  })

  it('allocates monotonic sequences and appends one JSON object per line', () => {
    const path = fixture()
    appendActivity({ event: ACTIVITY_EVENTS.OWNER_CLAIM, cause: 'acquired', evidence: {} }, { path, now: () => 1000 })
    appendActivity({ event: ACTIVITY_EVENTS.FOREGROUND_ACTIVITY, cause: 'tool', evidence: {} }, { path, now: () => 1001 })
    const parsed = parseActivityJournal(readFileSync(path, 'utf8'))
    expect(parsed.rejected).toEqual([])
    expect(parsed.records.map(({ seq, atMs, event }) => ({ seq, atMs, event }))).toEqual([
      { seq: 1, atMs: 1000, event: 'owner-claim' },
      { seq: 2, atMs: 1001, event: 'foreground-activity' },
    ])
  })

  it('fails open for lifecycle callers when the target cannot be written', () => {
    expect(emitActivity({ event: ACTIVITY_EVENTS.PAUSE, cause: 'user', evidence: {} }, { path: '/dev/null/nope' })).toBe(false)
  })

  it('serialises concurrent writers without duplicate or missing sequences', async () => {
    const path = fixture()
    const modulePath = join(process.cwd(), 'scripts', 'batch-activity-journal.mjs')
    const eventPath = join(process.cwd(), 'scripts', 'batch-activity-journal-core.mjs')
    const code = [
      `import { appendActivity } from ${JSON.stringify(`file://${modulePath}`)}`,
      `import { ACTIVITY_EVENTS } from ${JSON.stringify(`file://${eventPath}`)}`,
      `for (let i=0;i<12;i++) appendActivity({event:ACTIVITY_EVENTS.FOREGROUND_ACTIVITY,cause:'test',evidence:{i}}, {path:${JSON.stringify(path)}})`,
    ].join(';')
    const children = Array.from({ length: 6 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '--eval', code], { stdio: 'ignore' })
      child.once('error', reject)
      child.once('exit', (exitCode) => exitCode === 0 ? resolve() : reject(new Error(`writer exited ${exitCode}`)))
    }))
    await Promise.all(children)
    const parsed = parseActivityJournal(readFileSync(path, 'utf8'))
    expect(parsed.rejected).toEqual([])
    expect(parsed.records).toHaveLength(72)
    expect(parsed.records.map((r) => r.seq)).toEqual(Array.from({ length: 72 }, (_, i) => i + 1))
  }, 15_000)
})
