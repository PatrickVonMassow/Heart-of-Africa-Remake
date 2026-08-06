// Vitest coverage for the pure Pages-unblock logic (pages-deploy-unblock-core.mjs):
// which deployment counts as blocking, which listing entries are worth asking
// about, when the deploy is retried (and when it stays red at once), and that a
// stall report NAMES what blocks it.
import { describe, it, expect } from 'vitest'
import {
  ageMinutes,
  blockingDeployments,
  candidateDeployments,
  isBlockingStatus,
  shouldRetryDeploy,
  stallReport,
  INSPECT_LIMIT,
} from './pages-deploy-unblock-core.mjs'

describe('isBlockingStatus', () => {
  it('treats the in-flight statuses as blocking', () => {
    for (const s of ['deployment_in_progress', 'queued', 'building', 'deployment_attempt_error', 'in_progress'])
      expect(isBlockingStatus(s)).toBe(true)
  })

  it('treats every finished status as done', () => {
    for (const s of [
      'succeed',
      'deployment_failed',
      'deployment_content_failed',
      'deployment_cancelled',
      'deployment_lost',
    ])
      expect(isBlockingStatus(s)).toBe(false)
  })

  it('never reports a failed lookup as a stuck deployment', () => {
    expect(isBlockingStatus('not_found')).toBe(false)
    expect(isBlockingStatus('unknown_status')).toBe(false)
    expect(isBlockingStatus('')).toBe(false)
    expect(isBlockingStatus(null)).toBe(false)
    expect(isBlockingStatus(undefined)).toBe(false)
  })

  it('is case- and whitespace-insensitive', () => {
    expect(isBlockingStatus('  SUCCEED ')).toBe(false)
    expect(isBlockingStatus(' Deployment_In_Progress ')).toBe(true)
  })
})

describe('candidateDeployments', () => {
  const dep = (over = {}) => ({
    id: 1,
    sha: 'a'.repeat(40),
    environment: 'github-pages',
    created_at: '2026-08-06T14:00:00Z',
    ...over,
  })

  it('keeps only github-pages entries, newest first, deduplicated', () => {
    const out = candidateDeployments([
      dep({ id: 3, sha: 'b'.repeat(40) }),
      dep({ id: 2, sha: 'c'.repeat(40), environment: 'production' }),
      dep({ id: 1, sha: 'b'.repeat(40) }),
    ])
    expect(out.map((d) => d.sha)).toEqual(['b'.repeat(40)])
    expect(out[0].id).toBe(3)
  })

  it('drops entries without a usable sha and caps the inspection', () => {
    const many = Array.from({ length: INSPECT_LIMIT + 5 }, (_, i) =>
      dep({ id: i, sha: i.toString(16).padStart(40, '0') }),
    )
    expect(candidateDeployments([...many, dep({ sha: 'not-a-sha' })])).toHaveLength(INSPECT_LIMIT)
  })

  it('orders newest first even when the listing does not, junk timestamps last', () => {
    const out = candidateDeployments([
      dep({ sha: 'a'.repeat(40), created_at: '2026-08-06T13:00:00Z' }),
      dep({ sha: 'b'.repeat(40), created_at: 'nonsense' }),
      dep({ sha: 'c'.repeat(40), created_at: '2026-08-06T15:00:00Z' }),
    ])
    expect(out.map((d) => d.sha[0])).toEqual(['c', 'a', 'b'])
  })

  it('survives junk input', () => {
    expect(candidateDeployments(null)).toEqual([])
    expect(candidateDeployments([null, 7, 'x'])).toEqual([])
  })
})

describe('blockingDeployments', () => {
  it('returns the unfinished run at the top of the list', () => {
    const out = blockingDeployments([
      { sha: 'aaa1111', status: 'deployment_in_progress' },
      { sha: 'bbb2222', status: 'queued' },
      { sha: 'ccc3333', status: 'succeed' },
    ])
    expect(out.map((d) => d.sha)).toEqual(['aaa1111', 'bbb2222'])
  })

  // Measured on the real repository: six abandoned deployments sit in
  // `deployment_in_progress` for good, all older than one that succeeded.
  it('ignores unfinished deployments OLDER than a completed one — they block nothing', () => {
    const out = blockingDeployments([
      { sha: 'aaa1111', status: 'succeed' },
      { sha: 'bbb2222', status: 'deployment_in_progress' },
      { sha: 'ccc3333', status: 'deployment_in_progress' },
    ])
    expect(out).toEqual([])
  })

  // The incident's own sequence: our re-run is answered `Deployment cancelled.`
  // BECAUSE an older one holds the queue. Ending the search at our cancelled
  // record would hide exactly the blocker we came for.
  it('looks PAST a cancelled or lost record to the deployment that blocks it', () => {
    const out = blockingDeployments([
      { sha: 'aaa1111', status: 'deployment_cancelled' },
      { sha: 'bbb2222', status: 'deployment_lost' },
      { sha: 'cde5aee', status: 'deployment_in_progress' },
      { sha: 'ddd4444', status: 'succeed' },
    ])
    expect(out.map((d) => d.sha)).toEqual(['cde5aee'])
  })

  it('skips a status that says nothing instead of reading it as finished', () => {
    const out = blockingDeployments([
      { sha: 'aaa1111', status: 'not_found' },
      { sha: 'bbb2222', status: 'deployment_in_progress' },
      { sha: 'ccc3333', status: 'succeed' },
    ])
    expect(out.map((d) => d.sha)).toEqual(['bbb2222'])
  })

  it('counts a sha named from the outside wherever it sits', () => {
    const list = [
      { sha: 'aaa1111', status: 'succeed' },
      { sha: 'cde5aee', status: 'deployment_in_progress' },
    ]
    expect(blockingDeployments(list)).toEqual([])
    expect(blockingDeployments(list, { alsoConsider: ['cde5aee'] }).map((d) => d.sha)).toEqual(['cde5aee'])
    // Named but already finished stays out, and it is never listed twice.
    expect(blockingDeployments(list, { alsoConsider: ['aaa1111'] })).toEqual([])
    expect(
      blockingDeployments([{ sha: 'cde5aee', status: 'queued' }], { alsoConsider: ['cde5aee'] }),
    ).toHaveLength(1)
  })

  it('survives junk input', () => {
    expect(blockingDeployments(undefined)).toEqual([])
    expect(blockingDeployments([null, 5], { alsoConsider: null })).toEqual([])
  })
})

describe('shouldRetryDeploy', () => {
  it('retries once when a stuck deployment was actually cleared', () => {
    const d = shouldRetryDeploy({ deployFailed: true, cancelled: [{ sha: 'cde5aee6' }] })
    expect(d.retry).toBe(true)
    expect(d.reason).toContain('cde5aee')
  })

  it('stays red at once when the failure cleared nothing — not a queue stall', () => {
    const d = shouldRetryDeploy({ deployFailed: true, cancelled: [] })
    expect(d.retry).toBe(false)
    expect(d.reason).toContain('not a queue stall')
  })

  it('never retries a deploy that succeeded', () => {
    expect(shouldRetryDeploy({ deployFailed: false, cancelled: [{ sha: 'abc1234' }] }).retry).toBe(false)
  })

  it('survives junk input', () => {
    expect(shouldRetryDeploy().retry).toBe(false)
    expect(shouldRetryDeploy({ deployFailed: true, cancelled: 'nope' }).retry).toBe(false)
  })
})

describe('ageMinutes', () => {
  it('reports whole minutes since the timestamp', () => {
    const now = Date.parse('2026-08-06T15:00:00Z')
    expect(ageMinutes('2026-08-06T14:00:00Z', now)).toBe(60)
  })

  it('never goes negative and reports null for an unusable timestamp', () => {
    const now = Date.parse('2026-08-06T15:00:00Z')
    expect(ageMinutes('2026-08-06T16:00:00Z', now)).toBe(0)
    expect(ageMinutes('', now)).toBe(null)
    expect(ageMinutes(undefined, now)).toBe(null)
  })
})

describe('stallReport', () => {
  const now = Date.parse('2026-08-06T15:00:00Z')

  it('NAMES every blocking deployment with its status, age and what happened to it', () => {
    const text = stallReport({
      repo: 'o/r',
      blocking: [{ sha: 'cde5aee6ffff', status: 'deployment_in_progress', createdAt: '2026-08-06T14:00:00Z' }],
      cancelled: [{ sha: 'cde5aee6ffff' }],
      now,
    })
    expect(text).toContain('o/r')
    expect(text).toContain('cde5aee')
    expect(text).toContain('deployment_in_progress')
    expect(text).toContain('age=60 min')
    expect(text).toContain('cancelled')
    expect(text).toContain('pages-deploy-unblock.mjs --cancel')
  })

  it('names a cancel that did NOT work, with its error', () => {
    const text = stallReport({
      repo: 'o/r',
      blocking: [{ sha: 'cde5aee6ffff', status: 'deployment_in_progress' }],
      failed: [{ sha: 'cde5aee6ffff', error: 'HTTP 403' }],
      now,
    })
    expect(text).toContain('NOT cancelled')
    expect(text).toContain('HTTP 403')
  })

  it('says plainly when nothing blocks, so a stall is not invented', () => {
    const text = stallReport({ repo: 'o/r', blocking: [], now })
    expect(text).toContain('No in-progress Pages deployment')
    expect(text).toContain('look at the deploy step itself')
  })
})
