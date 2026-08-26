// The durable adoption flags are a live CLI contract. Exercise the real argv
// loop against an isolated repository so a bare --transferable cannot skip the
// option that follows it, and assert what is actually persisted.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const CLI = resolve(import.meta.dirname, 'batch-in-flight.mjs')
const OWNER = 'cli-owner'
let root = ''

const inFlightPath = () => join(root, '.claude', 'batch-in-flight.json')
const declaration = () => JSON.parse(readFileSync(inFlightPath(), 'utf8'))
// Every evidence item names its work-order point since point 713 — the board
// derives its now-cards from that mapping — so the fixture declares one; these
// cases are about the durable flags, not about the tagging rule.
const run = (...args) =>
  spawnSync(process.execPath, [CLI, '--waiting-on', 'durable worker', '--point', '895', ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOA_REPO_ROOT: root, HOA_ALERT_ESCALATION: 'off' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hoa-batch-in-flight-cli-'))
  mkdirSync(join(root, '.claude'), { recursive: true })
  writeFileSync(
    join(root, '.claude', 'batch-lock.json'),
    JSON.stringify({ sessionId: OWNER, claimedAt: Date.now() }),
  )
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('batch-in-flight — durable adoption CLI flags', () => {
  it('records a complete transferable block when the bare flag is last', () => {
    const result = run(
      '--pid', String(process.pid),
      '--durable-batch', 'B1',
      '--durable-point', '895',
      '--durable-attempt', 'A1',
      '--transferable',
    )

    expect(result.status, result.stderr).toBe(0)
    expect(declaration().durable).toEqual({
      batchId: 'B1',
      pointId: '895',
      attemptId: 'A1',
      pid: process.pid,
      pidStartedAt: expect.any(Number),
      transferable: true,
    })
  })

  it('records every following option when the bare flag is in the middle', () => {
    const result = run(
      '--pid', String(process.pid),
      '--durable-batch', 'B2',
      '--transferable',
      '--durable-point', '895',
      '--durable-attempt', 'A2',
    )

    expect(result.status, result.stderr).toBe(0)
    expect(declaration().durable).toEqual({
      batchId: 'B2',
      pointId: '895',
      attemptId: 'A2',
      pid: process.pid,
      pidStartedAt: expect.any(Number),
      transferable: true,
    })
  })

  it('refuses durable identities without process evidence and writes nothing', () => {
    const result = run(
      '--log', join(root, 'worker.log'),
      '--durable-batch', 'B3',
      '--durable-point', '895',
      '--durable-attempt', 'A3',
      '--transferable',
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/a durable adoption record identifies its worker process/)
    expect(result.stderr).toContain('Nothing recorded.')
    expect(existsSync(inFlightPath())).toBe(false)
  })

  it('refuses a partial durable block and names every missing identity', () => {
    const result = run('--pid', String(process.pid), '--durable-batch', 'B4')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('a durable block is all-or-nothing; missing: pointId, attemptId')
    expect(result.stderr).toContain('Nothing recorded.')
    expect(existsSync(inFlightPath())).toBe(false)
  })
})
