// Vitest coverage for the pure CI-status decision logic (ci-status-guard-core.mjs):
// red blocks and notifies once per sha, pending/success/none allow, malformed
// input fails open, and a green re-run supersedes its red predecessor.
import { describe, it, expect } from 'vitest'
import { classifyRuns, shouldBlock, shouldNotify, blockReason } from './ci-status-guard-core.mjs'

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
})
