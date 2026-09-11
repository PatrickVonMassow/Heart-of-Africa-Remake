import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cacheEnvironment, findGreenReceipt, formatCachedGreen, lastGreenReceipt } from './run-green-cache.mjs'

const ARGS = ['polish', '--section=adult-errands']
const green = (overrides = {}) => ({
  args: ARGS, head: 'abc123', verifyGl: null, status: 'finished', exitCode: 0,
  finishedAt: 60_000, receipt: { exitCode: 0, green: true }, ...overrides,
})
const entry = (overrides = {}) => ({ path: 'green.log.run.json', record: green(overrides) })
const request = (overrides = {}) => ({ argv: ARGS, head: 'abc123', records: [entry()], ...overrides })

describe('run-logged green receipts', () => {
  it('serves the last green for exactly the same head, suite and section', () => {
    const old = entry({ finishedAt: 100 })
    const latest = entry({ finishedAt: 120_000 })
    const found = lastGreenReceipt(request({ records: [latest, entry({ exitCode: 1 }), old] }))
    expect(found).toBe(latest)
    expect(formatCachedGreen(found, 240_000)).toBe('already green 2 min ago, receipt green.log.run.json')
  })

  it.each([
    { head: 'changed' }, { argv: ['settings', '--section=adult-errands'] },
    { argv: ['polish', '--section=other'] }, { argv: ['polish'] },
    { argv: ['large'] }, { argv: ['polish', 'settings'] },
    { argv: [...ARGS, '--baseline'] }, { verifyGl: 'webgl' },
    { again: true }, { clean: false }, { head: null },
    { environment: cacheEnvironment({ VERIFY_SEED: '1234' }) },
  ])('does not reuse a different request or an explicit fresh run: %j', (change) => {
    expect(lastGreenReceipt(request(change))).toBeNull()
  })

  it.each([
    { status: 'running' }, { exitCode: 1 }, { receipt: null },
    { receipt: { exitCode: 1 } }, { finishedAt: null }, { cleanAtStart: false },
    { receipt: { exitCode: 0, green: false, failing: [{ name: 'settings' }] } },
    { args: ['large', ...ARGS] },
  ])('does not reuse incomplete or ineligible evidence: %j', (change) => {
    expect(lastGreenReceipt(request({ records: [entry(change)] }))).toBeNull()
  })

  it('keeps seed and retry settings distinct while ignoring wrapper controls', () => {
    expect(cacheEnvironment({ VERIFY_NO_WAIT: '1', VERIFY_LOG_DIR: 'logs', VERIFY_GL: 'webgl' })).toBe('[]')
    const environment = cacheEnvironment({ VERIFY_SEED: '1234', VERIFY_NO_RETRY: '1' })
    expect(lastGreenReceipt(request({ environment, records: [entry({ cacheEnvironment: environment })] }))).not.toBeNull()
    expect(lastGreenReceipt(request({ environment, records: [entry()] }))).toBeNull()
  })

  it('finds a green beyond twenty newer red records and ignores torn JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-green-cache-'))
    try {
      writeFileSync(join(dir, 'old.log.run.json'), JSON.stringify(green()))
      for (let i = 0; i < 25; i++) {
        writeFileSync(join(dir, `${i}.log.run.json`), JSON.stringify(green({ exitCode: 1 })))
      }
      writeFileSync(join(dir, 'torn.run.json'), '{')
      const found = findGreenReceipt({ ...request(), dir, clean: true })
      expect(found.path).toBe(join(dir, 'old.log.run.json'))
      expect(findGreenReceipt({ ...request(), dir, clean: true, again: true })).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
