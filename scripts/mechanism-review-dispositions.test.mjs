import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTION_DISPOSITION_KIND,
  CONTRIBUTION_SCOPE_BOUNDARY,
  LEGACY_CONTRIBUTION_BASELINE,
  LEGACY_RANGE_RETIREMENT_REASON,
} from './mechanism-review-core.mjs'
import {
  attachContributionDispositions,
  pendingReviewContributions,
} from './mechanism-review-guard.mjs'
import { mechanismLogCommand, parseRangeLog } from './mechanism-review-range-core.mjs'
import { unquoteGitPath } from './review-material-core.mjs'

const rows = readFileSync('.claude/mechanism-reviews.jsonl', 'utf8')
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line))
const dispositions = rows.filter((row) => row.kind === CONTRIBUTION_DISPOSITION_KIND)

describe('the recorded legacy contribution disposition', () => {
  it('names every mechanism contribution from the confirmed baseline through the migration boundary exactly once', () => {
    const raw = execFileSync('git', mechanismLogCommand(LEGACY_CONTRIBUTION_BASELINE, CONTRIBUTION_SCOPE_BOUNDARY), {
      encoding: 'utf8',
      windowsHide: true,
    })
    const commits = parseRangeLog(raw, { decodePath: unquoteGitPath })
    const expected = pendingReviewContributions(commits, readdirSync('scripts')).map((commit) => commit.sha).sort()
    const recorded = dispositions.map((row) => row.sha).sort()
    expect(recorded).toEqual(expected)
    expect(new Set(recorded).size).toBe(recorded.length)
  })

  it('records the measured 45/42/115 backlog and a finite reviewed-or-retired answer for each contribution', () => {
    expect(dispositions).toHaveLength(240)
    expect(dispositions.filter((row) => row.disposition === 'reviewed')).toHaveLength(79)
    const retired = dispositions.filter((row) => row.disposition === 'retired')
    expect(retired).toHaveLength(161)
    for (const row of dispositions) {
      expect(row.scopeBoundary).toBe(CONTRIBUTION_SCOPE_BOUNDARY)
      expect(['reviewed', 'retired']).toContain(row.disposition)
    }
    for (const row of retired) {
      expect(row.reason).toBe(LEGACY_RANGE_RETIREMENT_REASON)
      expect(row.measurement).toEqual({
        measuredOn: '2026-08-26',
        point: 943,
        passesAtOpen: 45,
        passesAtClose: 42,
        passesOnMain: 115,
      })
    }
  })

  it('lets the guard re-verify every retirement from Git, not from the ledger claim', () => {
    const copies = dispositions.map((row) => structuredClone(row))
    attachContributionDispositions(copies)
    const retired = copies.filter((row) => row.disposition === 'retired')
    expect(retired.every((row) => row.contributionDispositionVerified === true)).toBe(true)
    expect(copies.filter((row) => row.disposition === 'reviewed').every(
      (row) => row.contributionDispositionVerified === undefined,
    )).toBe(true)
  })
})
