import { describe, expect, it } from 'vitest'
import {
  ERROR_OUTPUT_BUDGET,
  FIRST_CAUSE_HARD_MAX,
  ORDINARY_OUTPUT_BUDGET,
  PER_CALL_MAX_CHARS,
  budgetErrorOutput,
  budgetToolOutput,
  cutMiddle,
} from './tool-output-budget-core.mjs'

const LOG = 'local/tool-output-logs/test.log'
const stack = ['AssertionError: expected 2 to be 3', '    at calculate (src/math.ts:18:7)', '    at test (src/math.test.ts:9:3)'].join('\n')

describe('tool-output error channel', () => {
  it('collapses a twenty-fold repeated stack to one cause plus its count, while keeping every failing test name', () => {
    const raw = Array.from({ length: 20 }, (_, i) => ` FAIL  src/math.test.ts > case ${i + 1}\n${stack}`).join('\n')
    const result = budgetErrorOutput(raw, { logPath: LOG, command: 'npm run test:unit' })

    expect(result.causes).toHaveLength(1)
    expect(result.text.match(/AssertionError: expected 2 to be 3/g)).toHaveLength(1)
    expect(result.text).toContain('first distinct cause (20 occurrences)')
    expect(result.text).toContain('collapsed 19 repeated occurrence(s)')
    for (let i = 1; i <= 20; i++) expect(result.text).toContain(`src/math.test.ts > case ${i}`)
  })

  it('keeps the first distinct cause whole when it is far larger than the ordinary budget', () => {
    const cause = `ASSERTION AT THE HEAD\n${'diagnostic detail\n'.repeat(1_000)}SUMMARY AT THE TAIL`
    expect(cause.length).toBeGreaterThan(ORDINARY_OUTPUT_BUDGET)
    expect(cause.length).toBeLessThan(FIRST_CAUSE_HARD_MAX)

    const result = budgetErrorOutput(cause, { logPath: LOG })
    expect(result.text).toContain(cause)
    expect(result.cuts).toHaveLength(0)
  })

  it('caps a first cause larger than its own hard maximum and points to the spill log', () => {
    const cause = `ASSERTION AT THE HEAD\n${'x'.repeat(FIRST_CAUSE_HARD_MAX + 20_000)}\nSUMMARY AT THE TAIL`
    const result = budgetErrorOutput(cause, { logPath: LOG })

    expect(result.text).toContain('ASSERTION AT THE HEAD')
    expect(result.text).toContain('SUMMARY AT THE TAIL')
    expect(result.text).toContain('OMITTED')
    expect(result.text).toContain(`node scripts/verify/run-logged.mjs --show ${LOG} --tail 120`)
    expect(result.text.length).toBeLessThanOrEqual(ERROR_OUTPUT_BUDGET)
  })

  it('keeps a second distinct cause as a bounded excerpt with its pointer', () => {
    const second = `SECOND ASSERTION\n${'second detail\n'.repeat(1_000)}SECOND SUMMARY`
    const raw = ` FAIL  a.test.ts > first\n${stack}\n FAIL  b.test.ts > second\n${second}`
    const result = budgetErrorOutput(raw, { logPath: LOG })

    expect(result.causes).toHaveLength(2)
    expect(result.text).toContain('distinct cause 2')
    expect(result.text).toContain('SECOND ASSERTION')
    expect(result.text).toContain('SECOND SUMMARY')
    expect(result.text).toContain('OMITTED')
    expect(result.text).toContain(`node scripts/verify/run-logged.mjs --show ${LOG} --tail 120`)
  })

  it('cuts from the middle and preserves both the head assertion and tail summary', () => {
    const raw = `HEAD ASSERTION\n${'middle\n'.repeat(5_000)}TAIL SUMMARY`
    const result = cutMiddle(raw, 2_000, { logPath: LOG })

    expect(result.text.startsWith('HEAD ASSERTION')).toBe(true)
    expect(result.text.endsWith('TAIL SUMMARY')).toBe(true)
    expect(result.text).toContain(`OMITTED ${result.omitted} CHARACTERS FROM THE MIDDLE`)
    expect(result.text).toHaveLength(2_000)
  })

  it('never records a cut without an explicit omission count and selective fetch command', () => {
    const raw = Array.from(
      { length: 30 },
      (_, i) => ` FAIL  file-${i}.test.ts > case ${i}\nCAUSE ${i}\n${String(i).repeat(10_000)}\nSUMMARY ${i}`,
    ).join('\n')
    const result = budgetErrorOutput(raw, { logPath: LOG })

    expect(result.cuts.length).toBeGreaterThan(0)
    for (const cut of result.cuts) {
      expect(cut.text).toMatch(/OMITTED \d+ /)
      expect(cut.text).toContain(`--show ${LOG} --tail 120`)
    }
  })

  it('admits no ordinary or error output above the per-call hard maximum', () => {
    const success = budgetToolOutput({ text: 'ok\n'.repeat(100_000), exitCode: 0, logPath: LOG })
    const error = budgetToolOutput({ text: `ERROR\n${'bad\n'.repeat(100_000)}SUMMARY`, exitCode: 1, logPath: LOG })

    expect(success.text.length).toBeLessThanOrEqual(ORDINARY_OUTPUT_BUDGET)
    expect(error.text.length).toBeLessThanOrEqual(ERROR_OUTPUT_BUDGET)
    expect(Math.max(success.text.length, error.text.length)).toBeLessThanOrEqual(PER_CALL_MAX_CHARS)
  })
})
