import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  CONTEXT_FENCE_PERMIT_TTL_MS,
  consumeContextPermit,
  issueContextPermit,
} from './context-fence-permit.mjs'
import { contextPermitDecision } from './context-fence-permit-core.mjs'

const roots = []
const fixture = () => {
  const root = mkdtempSync(resolve(tmpdir(), 'hoa-context-permit-'))
  roots.push(root)
  return {
    path: resolve(root, 'permit.json'),
    pendingPath: resolve(root, 'pending.json'),
    recordPath: resolve(root, 'record.jsonl'),
    lockPath: resolve(root, 'state.lock'),
  }
}
const records = (path) => readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))

afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true })
})

describe('the context emergency permit', () => {
  it('is issued through the specified CLI contract', () => {
    const paths = fixture()
    const root = resolve(paths.path, '..')
    const cli = resolve(process.cwd(), 'scripts', 'context-fence-override.mjs')
    const result = spawnSync(process.execPath, [
      cli,
      '--session', 'cli-session',
      '--point', '745',
      '--reason', 'one deliberate recovery call',
      '--max-tokens', '15000',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, HOA_REPO_ROOT: root },
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('issued once for session cli-session, point 745')
    expect(JSON.parse(readFileSync(resolve(root, '.claude', 'context-fence-permit.json'), 'utf8'))).toMatchObject({
      status: 'issued', sessionId: 'cli-session', point: 745, maxTokens: 15_000,
    })
  })

  it('is consumed exactly once and leaves an append-only record', () => {
    const paths = fixture()
    let now = 1_000
    const permit = issueContextPermit(
      { sessionId: 's', point: 745, reason: 'finish the critical repair', maxTokens: 20_000 },
      { ...paths, now: () => now, id: () => 'permit-1', head: () => 'abc123' },
    )
    expect(permit.expiresAt).toBe(1_000 + CONTEXT_FENCE_PERMIT_TTL_MS)
    const input = {
      sessionId: 's',
      point: 745,
      projectedCost: 10_956,
      reading: { tokens: 112_000 },
      caller: { toolName: 'Read', filePath: 'large.log' },
      toolUseId: 'tool-1',
    }
    expect(consumeContextPermit(input, { ...paths, now: () => ++now }).used).toBe(true)
    expect(consumeContextPermit(input, { ...paths, now: () => ++now })).toMatchObject({
      used: false,
      reason: 'no-unused-permit',
    })
    expect(records(paths.recordPath)).toEqual([
      expect.objectContaining({ event: 'issued', id: 'permit-1', reason: 'finish the critical repair' }),
      expect.objectContaining({
        event: 'consumed',
        permitId: 'permit-1',
        repositoryHead: 'abc123',
        reading: 112_000,
        projectedCost: 10_956,
        actualResult: null,
      }),
    ])
  })

  it('is refused for another session, another point, after expiry, or above its cap', () => {
    const permit = {
      status: 'issued', sessionId: 's', point: 745, maxTokens: 12_000, expiresAt: 20_000,
    }
    expect(contextPermitDecision(permit, { sessionId: 'other', point: 745, projectedCost: 1, now: 1_000 }).reason).toBe('another-session')
    expect(contextPermitDecision(permit, { sessionId: 's', point: 746, projectedCost: 1, now: 1_000 }).reason).toBe('another-point')
    expect(contextPermitDecision(permit, { sessionId: 's', point: 745, projectedCost: 1, now: 20_000 }).reason).toBe('expired')
    expect(contextPermitDecision(permit, { sessionId: 's', point: 745, projectedCost: 12_001, now: 1_000 }).reason).toBe('cost-exceeds-permit')
    expect(contextPermitDecision(permit, { sessionId: 's', point: 745, projectedCost: 12_000, now: 1_000 }).use).toBe(true)
  })

  it('records the actual result through the already-wired all-tools PostToolUse hook', () => {
    const paths = fixture()
    const root = resolve(paths.path, '..')
    // Re-issue the fixture under the live filenames the hook imports.
    const live = {
      path: resolve(root, '.claude', 'context-fence-permit.json'),
      pendingPath: resolve(root, '.claude', 'context-fence-permit-pending.json'),
      recordPath: resolve(root, '.claude', 'context-fence-permits.jsonl'),
      lockPath: resolve(root, '.claude', 'context-fence-state.lock'),
    }
    issueContextPermit(
      { sessionId: 'live', point: 745, reason: 'live hook operation', maxTokens: 20_000 },
      { ...live, now: () => 2_000, id: () => 'permit-live', head: () => 'abc789' },
    )
    consumeContextPermit({
      sessionId: 'live', point: 745, projectedCost: 10_000, reading: { tokens: 120_000 },
      caller: { toolName: 'Bash', command: 'npm test' }, toolUseId: 'tool-live',
    }, { ...live, now: () => 2_001 })
    const hook = spawnSync(process.execPath, [resolve(process.cwd(), 'scripts', 'lock-heartbeat-hook.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, HOA_REPO_ROOT: root },
      input: JSON.stringify({
        session_id: 'live', hook_event_name: 'PostToolUse', tool_use_id: 'tool-live', tool_name: 'Bash',
        tool_input: { command: 'npm test' }, tool_response: { exit_code: 0, stdout: 'completed' },
      }),
    })
    expect(hook.status, hook.stderr).toBe(0)
    expect(records(live.recordPath).at(-1)).toMatchObject({
      event: 'result',
      permitId: 'permit-live',
      actualResult: { outcome: 'completed', exitCode: 0, responseChars: expect.any(Number) },
    })
  })
})
