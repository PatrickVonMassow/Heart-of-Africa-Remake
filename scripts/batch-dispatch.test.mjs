import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { dispatchOnce } from './batch-dispatch.mjs'

const sha = 'a'.repeat(40)
const roots = []
const queue = () => Array.from({ length: 3 }, (_, index) => ({
  pointId: String(index + 1), attemptId: `a-${index + 1}`, branch: `feat/${index + 1}`,
  worktree: `/tmp/wt-${index + 1}`, adapter: 'sol', baseSha: sha, dependencies: [],
}))

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('measured production dispatch', () => {
  it('writes exactly one open reason interval and closes it when the pool recovers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dispatch-metric-'))
    roots.push(root)
    const queuePath = join(root, 'queue.json')
    writeFileSync(queuePath, JSON.stringify(queue()))
    const journal = []
    let pressured = true
    const request = async ({ request: command }) => {
      if (command.cmd === 'status') {
        return pressured
          ? { ok: true, result: { attempts: [{ state: 'ready-for-review' }, { state: 'ready-for-review' }] } }
          : { ok: true, result: { attempts: queue().map((entry) => ({ ...entry, state: 'running' })) } }
      }
      if (command.cmd === 'record-metric') {
        journal.push({ kind: 'command', name: 'record-metric', fence: 7, seq: journal.length + 1, payload: command.payload })
        return { ok: true, result: { eventId: command.payload.eventId } }
      }
      throw new Error(`unexpected command: ${command.cmd}`)
    }
    const common = {
      repoDir: root, batchId: 'b', sessionId: 's', fence: 7, queuePath, request,
      openStore: () => ({ dir: root }), readDurableJournal: () => ({ verdict: 'ok', entries: journal }),
    }
    const first = await dispatchOnce({ ...common, now: () => 100 })
    expect(first.ok).toBe(true)
    expect(journal.filter((entry) => entry.payload.event.kind === 'dispatch-reason')).toHaveLength(1)
    expect(journal.at(-2)?.payload.event).toMatchObject({ phase: 'open', reasonCode: 'review-backlog' })
    pressured = false
    const second = await dispatchOnce({ ...common, now: () => 250 })
    expect(second.ok).toBe(true)
    const reasons = journal.filter((entry) => entry.payload.event.kind === 'dispatch-reason').map((entry) => entry.payload.event)
    expect(reasons).toEqual([
      expect.objectContaining({ phase: 'open', startedAt: 100 }),
      expect.objectContaining({ phase: 'closed', startedAt: 100, endedAt: 250 }),
    ])
    expect(journal.some((entry) => entry.payload.event.kind === 'lane-utilization')).toBe(true)
  })
})
