import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FABLE_ESCALATION_ROUNDS } from './author-routing-core.mjs'

const root = resolve(process.cwd())
const script = resolve(root, 'scripts', 'author-sol.mjs')
const point = '999991'
const dirs = []

function ledger(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-author-rounds-'))
  dirs.push(dir)
  const path = join(dir, 'reviews.jsonl')
  writeFileSync(path, rows.map((row) => JSON.stringify({ sha: 'a'.repeat(40), ...row })).join('\n'))
  return path
}

function route(records, extra = []) {
  return spawnSync(process.execPath, [script, '--routing', '--point', point, ...extra], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, AUTHOR_REVIEW_RECORDS_FILE: records },
  })
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('author-sol routing reads unsuccessful rounds from the review ledger', () => {
  it('reports zero and uses the ordinary lane when the point has no review record', () => {
    const result = route(ledger([]))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain('review record: 0 unsuccessful round(s)')
  })

  it('derives N non-passing reviews and moves at the exported boundary', () => {
    const rows = Array.from({ length: FABLE_ESCALATION_ROUNDS }, () => ({
      point: Number(point),
      mode: 'review',
      verdict: 'do-not-merge',
    }))
    rows.unshift({ point: Number(point), mode: 'review', verdict: 'merge' })
    const result = route(ledger(rows))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → fable`)
    expect(result.stdout).toContain(`review record: ${FABLE_ESCALATION_ROUNDS} unsuccessful round(s)`)
  })

  it('accepts an explicit numeric override for history outside the ledger', () => {
    const result = route(ledger([]), ['--rounds', String(FABLE_ESCALATION_ROUNDS)])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → fable`)
  })

  it('rejects a numeric spelling that cannot be represented as an integer', () => {
    const result = route(ledger([]), ['--rounds', '9'.repeat(400)])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--rounds needs a non-negative integer')
  })
})
