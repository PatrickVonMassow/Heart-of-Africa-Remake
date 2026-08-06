// Vitest coverage for the pure CI-status decision logic (ci-status-guard-core.mjs):
// red blocks and notifies once per sha, pending/success/none allow, malformed
// input fails open, and a green re-run supersedes its red predecessor.
import { describe, it, expect } from 'vitest'
import { classifyRuns, failedRuns, recoveredWorkflows, shouldBlock, shouldNotify, blockReason } from './ci-status-guard-core.mjs'

const HEAD = 'abc123def456'

const run = (over = {}) => ({
  databaseId: 1,
  headSha: HEAD,
  status: 'completed',
  conclusion: 'success',
  workflowName: 'CI',
  url: 'https://github.com/o/r/actions/runs/1',
  ...over,
})

// The waiver must be judged against EVERY red on the commit, not the one API
// list order happens to surface (four-eyes review, 06.08.2026): a famine-shaped
// watchdog run must never excuse a genuinely red CI run on the same sha.
describe('failedRuns', () => {
  it('returns every failed workflow on the head, not just the first', () => {
    const got = failedRuns(
      [
        run({ databaseId: 9, workflowName: 'Batch watchdog', conclusion: 'failure' }),
        run({ databaseId: 8, workflowName: 'CI', conclusion: 'failure' }),
        run({ databaseId: 7, workflowName: 'Deploy to GitHub Pages', conclusion: 'success' }),
      ],
      HEAD,
    )
    expect(got.map((r) => r.workflowName).sort()).toEqual(['Batch watchdog', 'CI'])
    expect(got.every((r) => r.state === 'failed')).toBe(true)
  })

  it('keeps only the newest run per workflow, so a green re-run drops out', () => {
    const got = failedRuns(
      [
        run({ databaseId: 1, workflowName: 'CI', conclusion: 'failure' }),
        run({ databaseId: 2, workflowName: 'CI', conclusion: 'success' }),
      ],
      HEAD,
    )
    expect(got).toEqual([])
  })

  it('ignores other commits, unfinished runs and junk', () => {
    expect(failedRuns([run({ headSha: 'other', conclusion: 'failure' })], HEAD)).toEqual([])
    expect(failedRuns([run({ status: 'in_progress', conclusion: null })], HEAD)).toEqual([])
    expect(failedRuns(null, HEAD)).toEqual([])
    expect(failedRuns([run({ conclusion: 'failure' })], '')).toEqual([])
  })

  it('agrees with classifyRuns on whether the head is red at all', () => {
    const runs = [run({ conclusion: 'failure', databaseId: 3 })]
    expect(failedRuns(runs, HEAD).length > 0).toBe(shouldBlock(classifyRuns(runs, HEAD).state))
  })
})

describe('classifyRuns', () => {
  it('classifies a failed latest run for HEAD as failed with its identity', () => {
    const c = classifyRuns([run({ conclusion: 'failure', databaseId: 7 })], HEAD)
    expect(c.state).toBe('failed')
    expect(c.runId).toBe(7)
    expect(c.workflowName).toBe('CI')
    expect(c.conclusion).toBe('failure')
  })

  it('treats cancelled and timed_out as failed too', () => {
    expect(classifyRuns([run({ conclusion: 'cancelled' })], HEAD).state).toBe('failed')
    expect(classifyRuns([run({ conclusion: 'timed_out' })], HEAD).state).toBe('failed')
  })

  it('classifies an unfinished run as pending', () => {
    expect(classifyRuns([run({ status: 'in_progress', conclusion: null })], HEAD).state).toBe('pending')
    expect(classifyRuns([run({ status: 'queued', conclusion: null })], HEAD).state).toBe('pending')
  })

  it('classifies a green run as success', () => {
    expect(classifyRuns([run()], HEAD).state).toBe('success')
  })

  it('a newer green re-run of the same workflow supersedes the red one', () => {
    const c = classifyRuns(
      [run({ databaseId: 9, conclusion: 'success' }), run({ databaseId: 3, conclusion: 'failure' })],
      HEAD,
    )
    expect(c.state).toBe('success')
  })

  it('a red workflow beats a green sibling workflow (any red is red)', () => {
    const c = classifyRuns(
      [run({ workflowName: 'CI' }), run({ databaseId: 2, workflowName: 'Pages', conclusion: 'failure' })],
      HEAD,
    )
    expect(c.state).toBe('failed')
    expect(c.workflowName).toBe('Pages')
  })

  it('ignores runs for other shas — none when nothing matches HEAD', () => {
    expect(classifyRuns([run({ headSha: 'other' })], HEAD).state).toBe('none')
    expect(classifyRuns([], HEAD).state).toBe('none')
  })

  it('accepts the REST API field names (head_sha/id/name)', () => {
    const c = classifyRuns(
      [{ id: 5, head_sha: HEAD, status: 'completed', conclusion: 'failure', name: 'CI', html_url: 'u' }],
      HEAD,
    )
    expect(c.state).toBe('failed')
    expect(c.runId).toBe(5)
    expect(c.url).toBe('u')
  })

  it('fails open on malformed input, never throws', () => {
    expect(classifyRuns(null, HEAD).state).toBe('none')
    expect(classifyRuns('nonsense', HEAD).state).toBe('none')
    expect(classifyRuns([null, 42, {}], HEAD).state).toBe('none')
    expect(classifyRuns([run()], '').state).toBe('none')
    expect(classifyRuns([run({ conclusion: 'weird_new_value' })], HEAD).state).toBe('none')
  })
})

describe('shouldBlock / shouldNotify', () => {
  it('blocks only a confirmed red', () => {
    expect(shouldBlock('failed')).toBe(true)
    expect(shouldBlock('pending')).toBe(false)
    expect(shouldBlock('success')).toBe(false)
    expect(shouldBlock('none')).toBe(false)
  })

  it('notifies a red once per sha — a second turn on the same sha stays silent', () => {
    expect(shouldNotify('failed', undefined, HEAD)).toBe(true)
    expect(shouldNotify('failed', HEAD, HEAD)).toBe(false) // already pinged this sha
    expect(shouldNotify('failed', 'oldsha', HEAD)).toBe(true) // a NEW failing sha pings again
    expect(shouldNotify('success', undefined, HEAD)).toBe(false)
    expect(shouldNotify('pending', undefined, HEAD)).toBe(false)
    expect(shouldNotify('failed', undefined, '')).toBe(false)
  })
})

describe('blockReason', () => {
  it('names the run, the local reproduction and the way out', () => {
    const reason = blockReason(
      { runId: 7, workflowName: 'CI', conclusion: 'failure', url: 'https://x' },
      HEAD,
    )
    expect(reason).toContain(HEAD.slice(0, 7))
    expect(reason).toContain('"CI"')
    expect(reason).toContain('run 7')
    expect(reason).toContain('https://x')
    expect(reason).toContain('npm run test:unit')
    expect(reason).toContain('--log-failed')
  })

  it('tolerates a missing classification', () => {
    expect(() => blockReason(undefined, undefined)).not.toThrow()
  })

  // Point 526: a red the repository cannot clear must not demand a fixing push.
  it('says outright when the red is NOT in the repository, and names the handle', () => {
    const reason = blockReason(
      {
        runId: 7,
        workflowName: 'Deploy to GitHub Pages',
        conclusion: 'failure',
        cause: 'external',
        detail: 'the failing job is "deploy"',
        remedy: 'No push in this repository can clear this. Run `node scripts/pages-deploy-unblock.mjs --cancel`.',
      },
      HEAD,
    )
    expect(reason).toContain('NOT IN THE REPOSITORY')
    expect(reason).toContain('the failing job is "deploy"')
    expect(reason).toContain('pages-deploy-unblock.mjs --cancel')
    expect(reason).not.toContain('npm run test:unit')
  })

  it('names both paths when the side could not be determined', () => {
    const reason = blockReason(
      {
        runId: 7,
        workflowName: 'Deploy to GitHub Pages',
        conclusion: 'failure',
        cause: 'unknown',
        detail: 'the job list could not be read',
        remedy: 'If the deploy job failed: run the unblock. If the build job failed: npm run test:unit.',
      },
      HEAD,
    )
    expect(reason).toContain('could not be determined')
    expect(reason).toContain('unblock')
    expect(reason).toContain('npm run test:unit')
  })

  it('keeps the fixing-push wording for a red that IS ours', () => {
    const reason = blockReason(
      { runId: 7, workflowName: 'CI', conclusion: 'failure', cause: 'repository', detail: 'the failing job is "gate"' },
      HEAD,
    )
    expect(reason).toContain('the failing job is "gate"')
    expect(reason).toContain('npm run test:unit')
    expect(reason).toContain('Only a fixing push')
  })
})

// The outage waiver's clock is per workflow and must not outlive the outage
// (four-eyes review, 06.08.2026, finding 1): a clock left behind makes the NEXT
// famine read as an already-expired waiver and escalate on its first sighting.
describe('recoveredWorkflows', () => {
  it('names the workflows whose newest run reached a non-failing verdict', () => {
    expect(
      recoveredWorkflows(
        [
          run({ databaseId: 1, workflowName: 'CI', conclusion: 'failure' }),
          run({ databaseId: 2, workflowName: 'CI', conclusion: 'success' }), // the re-run
          run({ databaseId: 3, workflowName: 'Deploy to GitHub Pages', conclusion: 'skipped' }),
        ],
        HEAD,
      ).sort(),
    ).toEqual(['CI', 'Deploy to GitHub Pages'])
  })

  it('never calls a workflow recovered while it is still red or still running', () => {
    expect(recoveredWorkflows([run({ conclusion: 'failure' })], HEAD)).toEqual([])
    expect(recoveredWorkflows([run({ status: 'in_progress', conclusion: null })], HEAD)).toEqual([])
    // A green re-run does NOT rescue a workflow whose newest run is the red one.
    expect(
      recoveredWorkflows([run({ databaseId: 1, conclusion: 'success' }), run({ databaseId: 2, conclusion: 'failure' })], HEAD),
    ).toEqual([])
  })

  it('ignores other commits and survives junk', () => {
    expect(recoveredWorkflows([run({ headSha: 'other' })], HEAD)).toEqual([])
    expect(recoveredWorkflows(null, HEAD)).toEqual([])
    expect(recoveredWorkflows([run()], '')).toEqual([])
  })
})
