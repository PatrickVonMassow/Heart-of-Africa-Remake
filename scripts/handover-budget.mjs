import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { repoPath } from './repo-paths.mjs'
import { handoverBudgetCompletion, handoverBudgetStart } from './handover-budget-core.mjs'

export const HANDOVER_BUDGET_START_PATH = repoPath('.claude/handover-budget.json')
export const HANDOVER_BUDGET_SERIES_PATH = repoPath('.claude/handover-costs.jsonl')

export function readHandoverBudgetStart(path = HANDOVER_BUDGET_START_PATH) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/** Remember only the first Stop refusal. Evidence may fail; the refusal may not. */
export function noteHandoverBudgetStart(input = {}, {
  path = HANDOVER_BUDGET_START_PATH,
  read = readHandoverBudgetStart,
  write = writeJsonAtomic,
} = {}) {
  try {
    const current = read(path)
    const record = handoverBudgetStart({ ...input, current })
    if (!record) return { written: false, reason: 'unmeasured', record: null }
    if (record === current) return { written: true, reason: 'already-recorded', record }
    write(path, record)
    return { written: true, reason: 'recorded', record }
  } catch (error) {
    return { written: false, reason: 'write-failed', record: null, error }
  }
}

/**
 * Append every completed measurement, including the explicit `exceeded` and
 * `overrunTokens` fields. Nothing in this recorder may fail the boundary.
 */
export function recordHandoverBudgetCompletion(input = {}, {
  startPath = HANDOVER_BUDGET_START_PATH,
  seriesPath = HANDOVER_BUDGET_SERIES_PATH,
  read = readHandoverBudgetStart,
  append = appendFileSync,
  makeDir = mkdirSync,
  say = console.log,
} = {}) {
  try {
    const record = handoverBudgetCompletion({ ...input, start: read(startPath) })
    if (!record) {
      say('\nWARNING: the handover cap could not be judged because its first refusal had no matching context reading; the boundary stands.')
      return { written: false, reason: 'unmeasured', record: null }
    }
    makeDir(dirname(seriesPath), { recursive: true })
    append(seriesPath, `${JSON.stringify(record)}\n`)
    if (record.exceeded) {
      say(
        `\nHANDOVER CAP EXCEEDED: this exit spent ${record.costTokens} tokens against the ${record.capTokens}-token ` +
          `reserve (${record.overrunTokens} over). The overrun was recorded; the boundary stands.`,
      )
    }
    return { written: true, reason: record.exceeded ? 'overrun' : 'within-cap', record }
  } catch (error) {
    say(`\nWARNING: the handover-cost record could not be written (${error?.message ?? error}); the boundary stands.`)
    return { written: false, reason: 'write-failed', record: null, error }
  }
}
