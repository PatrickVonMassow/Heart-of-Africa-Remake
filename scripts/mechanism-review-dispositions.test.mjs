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

// THE MIGRATION INTERVAL MUST BE IN THIS CLONE, and in CI it is not: the job
// checks out at fetch-depth 2 on purpose (.github/workflows/ci.yml documents why
// deeper reddened it), so `265712e..6edd81fd` is not a revision range there and
// every ancestry probe answers false. MEASURED 27.08.2026 on CI run 33034091057,
// which reddened for the checkout and not for the code — the two cases below then
// asserted a history the runner had never been given. Like the four-eyes-artefact
// and queue-calibration audits, they SKIP there and say why; every full clone runs
// them. What must never happen is the third shape: passing because the probe
// answered false. The guard itself is fail-closed on exactly this — an unreachable
// commit verifies no retirement — so a shallow checkout under-clears, never over-clears.
const historyReachable = (() => {
  try {
    execFileSync(
      'git',
      ['merge-base', '--is-ancestor', LEGACY_CONTRIBUTION_BASELINE, CONTRIBUTION_SCOPE_BOUNDARY],
      { windowsHide: true },
    )
    return true
  } catch {
    return false
  }
})()
if (!historyReachable) {
  console.warn(
    'mechanism-review-dispositions: SKIPPED the two history cases — ' +
      `${LEGACY_CONTRIBUTION_BASELINE.slice(0, 7)}..${CONTRIBUTION_SCOPE_BOUNDARY.slice(0, 7)} is not in this ` +
      'clone (shallow checkout); a full clone runs them',
  )
}

describe('the recorded legacy contribution disposition', () => {
  it.skipIf(!historyReachable)('names every mechanism contribution from the confirmed baseline through the migration boundary exactly once', () => {
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

  it.skipIf(!historyReachable)('lets the guard re-verify every retirement from Git, not from the ledger claim', () => {
    const copies = dispositions.map((row) => structuredClone(row))
    attachContributionDispositions(copies)
    const retired = copies.filter((row) => row.disposition === 'retired')
    expect(retired.every((row) => row.contributionDispositionVerified === true)).toBe(true)
    expect(copies.filter((row) => row.disposition === 'reviewed').every(
      (row) => row.contributionDispositionVerified === undefined,
    )).toBe(true)
  })
})
