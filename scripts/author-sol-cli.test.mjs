import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AUTHORING_COMMISSION_KIND, AUTHORING_FRAMINGS, FABLE_ESCALATION_ROUNDS } from './author-routing-core.mjs'
import { recordAuthoringCommission } from './author-sol.mjs'

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

function examine(records) {
  const cwd = mkdtempSync(join(tmpdir(), 'hoa-author-examination-'))
  dirs.push(cwd)
  return spawnSync(process.execPath, [script, '--point', '727'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, AUTHOR_REVIEW_RECORDS_FILE: records },
  })
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('author-sol records a commission before dispatch', () => {
  it('appends and durably commits the exact point, round and framing once', () => {
    const events = []
    const input = {
      records: [],
      point,
      round: 3,
      framing: AUTHORING_FRAMINGS[0],
      sha: 'b'.repeat(40),
      now: 1_787_130_000_000,
      append: (record) => events.push(['append', record]),
      commit: (record) => events.push(['commit', record]),
    }
    const first = recordAuthoringCommission(input)
    expect(first.written).toBe(true)
    expect(first.record).toMatchObject({
      kind: AUTHORING_COMMISSION_KIND,
      point: Number(point),
      round: 3,
      authorFraming: AUTHORING_FRAMINGS[0],
      sha: 'b'.repeat(40),
    })
    expect(events.map(([event]) => event)).toEqual(['append', 'commit'])

    const retry = recordAuthoringCommission({ ...input, records: [first.record] })
    expect(retry).toEqual({ written: false, record: first.record })
    expect(events.map(([event]) => event)).toEqual(['append', 'commit'])
  })

  it('refuses to rewrite the framing already recorded for a round', () => {
    const prior = {
      kind: AUTHORING_COMMISSION_KIND,
      point: Number(point),
      round: 3,
      authorFraming: AUTHORING_FRAMINGS[0],
    }
    expect(() =>
      recordAuthoringCommission({
        records: [prior],
        point,
        round: 3,
        framing: AUTHORING_FRAMINGS[1],
        sha: 'b'.repeat(40),
      }),
    ).toThrow(/different framing/)
  })
})

describe('author-sol routing reads unsuccessful rounds from the review ledger', () => {
  it('reports zero and uses the ordinary lane when the point has no review record', () => {
    const result = route(ledger([]))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain('review record: 0 unsuccessful round(s)')
  })

  it('derives N non-passing reviews and holds the lane while the escalation is suspended', () => {
    const rows = Array.from({ length: FABLE_ESCALATION_ROUNDS }, (_, round) => ({
      point: Number(point),
      mode: 'review',
      verdict: 'do-not-merge',
      ...(round > 1 ? { authorFraming: AUTHORING_FRAMINGS[round % AUTHORING_FRAMINGS.length] } : {}),
    }))
    rows.splice(FABLE_ESCALATION_ROUNDS - 1, 0, {
      point: Number(point),
      mode: 'review',
      verdict: 'merge',
      specExamination: 'sound',
      evidence: 'the specification is coherent and the difficulty is real',
    })
    rows.unshift({ point: Number(point), mode: 'review', verdict: 'merge' })
    const result = route(ledger(rows))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain('but the Fable escalation is SUSPENDED')
    expect(result.stdout).toContain(
      `review record: ${FABLE_ESCALATION_ROUNDS} unsuccessful round(s); ${FABLE_ESCALATION_ROUNDS} fresh attempt(s)`,
    )
    expect(result.stdout).toContain(`round 2: framing — ${AUTHORING_FRAMINGS[0]}`)
    expect(result.stdout).toContain('spec examination: sound')
  })

  it('reports an unframed later review as a repeat and does not advance the lane', () => {
    const rows = []
    for (let round = 0; round < FABLE_ESCALATION_ROUNDS; round += 1) {
      if (round > 1) {
        rows.push({ point: Number(point), kind: AUTHORING_COMMISSION_KIND, round, authorFraming: '' })
      }
      rows.push({ point: Number(point), mode: 'review', verdict: 'do-not-merge' })
    }
    const result = route(ledger(rows))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain(`${FABLE_ESCALATION_ROUNDS} unsuccessful round(s); 2 fresh attempt(s)`)
    expect(result.stdout).toContain('REPEAT — no author framing was recorded')
  })

  it('keeps all reviews from before commission receipts in the round count', () => {
    const rows = Array.from({ length: 11 }, () => ({
      point: Number(point),
      mode: 'review',
      verdict: 'do-not-merge',
    }))
    const result = route(ledger(rows))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain('11 unsuccessful round(s); 11 fresh attempt(s)')
  })

  it('accepts an explicit numeric override for history outside the ledger', () => {
    const result = route(ledger([]), ['--rounds', String(FABLE_ESCALATION_ROUNDS)])
    expect(result.status, result.stderr).toBe(0)
    // The override still carries the count; only the lane change is suspended.
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain('but the Fable escalation is SUSPENDED')
  })

  it('turns the override immediately before the threshold into the examination step', () => {
    const result = route(ledger([]), ['--rounds', String(FABLE_ESCALATION_ROUNDS - 1)])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('next step: spec-examination')
    expect(result.stdout).toContain(`threshold of ${FABLE_ESCALATION_ROUNDS}`)
  })

  it('rejects a numeric spelling that cannot be represented as an integer', () => {
    const result = route(ledger([]), ['--rounds', '9'.repeat(400)])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--rounds needs a non-negative integer')
  })
})

describe('author-sol examination does not require an authoring worktree', () => {
  it('prints the read-only examination packet before branch and worktree readiness', () => {
    const records = ledger(
      Array.from({ length: FABLE_ESCALATION_ROUNDS - 1 }, () => ({
        point: 727,
        mode: 'review',
        verdict: 'do-not-merge',
      })),
    )
    const result = examine(records)
    expect(result.status, result.stderr).toBe(4)
    expect(result.stdout).toContain('SPEC EXAMINATION REQUIRED')
    expect(result.stdout).toContain('SPEC EXAMINATION FOR WORK-ORDER POINT 727')
    expect(result.stderr).not.toContain('refusing to start')
  })
})
