// Vitest coverage for the pure red-cause classifier (ci-failure-cause-core.mjs):
// a Pages deploy stuck on GitHub's side is told apart from a failing build, a
// cancellation is nobody's fixing push, and an unreadable job list is reported
// as unknown rather than guessed.
import { describe, it, expect } from 'vitest'
import {
  PAGES_WORKFLOW,
  classifyFailureCause,
  failedJobNames,
} from './ci-failure-cause-core.mjs'

const job = (over = {}) => ({ name: 'build', status: 'completed', conclusion: 'success', ...over })

describe('failedJobNames', () => {
  it('names exactly the completed jobs that failed', () => {
    expect(
      failedJobNames([
        job(),
        job({ name: 'deploy', conclusion: 'failure' }),
        job({ name: 'later', status: 'in_progress', conclusion: null }),
        job({ name: 'timed', conclusion: 'timed_out' }),
      ]),
    ).toEqual(['deploy', 'timed'])
  })

  it('survives junk input', () => {
    expect(failedJobNames(null)).toEqual([])
    expect(failedJobNames([null, 3, {}])).toEqual([])
  })
})

describe('classifyFailureCause', () => {
  it('calls a failed Pages DEPLOY job external and names the unblock handle', () => {
    const c = classifyFailureCause({
      workflowName: PAGES_WORKFLOW,
      conclusion: 'failure',
      jobs: [job({ name: 'build' }), job({ name: 'deploy', conclusion: 'failure' })],
    })
    expect(c.cause).toBe('external')
    expect(c.failedJobs).toEqual(['deploy'])
    expect(c.remedy).toContain('pages-deploy-unblock.mjs --cancel')
    expect(c.remedy).toContain('No push in this repository')
  })

  it('calls a failed Pages BUILD job ours — it stays a fixing push', () => {
    const c = classifyFailureCause({
      workflowName: PAGES_WORKFLOW,
      conclusion: 'failure',
      jobs: [job({ name: 'build', conclusion: 'failure' })],
    })
    expect(c.cause).toBe('repository')
    expect(c.remedy).toContain('npm run test:unit')
  })

  it('stays ours when our build failed ALONGSIDE the deploy job', () => {
    const c = classifyFailureCause({
      workflowName: PAGES_WORKFLOW,
      conclusion: 'failure',
      jobs: [job({ name: 'build', conclusion: 'failure' }), job({ name: 'deploy', conclusion: 'failure' })],
    })
    expect(c.cause).toBe('repository')
    expect(c.detail).toContain('build')
  })

  it('calls every failed job of another workflow ours', () => {
    const c = classifyFailureCause({
      workflowName: 'CI',
      conclusion: 'failure',
      jobs: [job({ name: 'deploy', conclusion: 'failure' })],
    })
    expect(c.cause).toBe('repository')
  })

  it('calls a cancelled run external — no push clears a cancellation', () => {
    const ci = classifyFailureCause({ workflowName: 'CI', conclusion: 'cancelled', jobs: null })
    expect(ci.cause).toBe('external')
    expect(ci.remedy).toContain('re-run the workflow')

    const pages = classifyFailureCause({ workflowName: PAGES_WORKFLOW, conclusion: 'cancelled', jobs: null })
    expect(pages.cause).toBe('external')
    expect(pages.detail).toContain('concurrency group')
    expect(pages.remedy).toContain('pages-deploy-unblock.mjs --cancel')
  })

  it('reports unknown for a Pages red whose job list could not be read', () => {
    const c = classifyFailureCause({ workflowName: PAGES_WORKFLOW, conclusion: 'failure', jobs: null })
    expect(c.cause).toBe('unknown')
    // Names BOTH paths rather than guessing one.
    expect(c.remedy).toContain('pages-deploy-unblock.mjs --cancel')
    expect(c.remedy).toContain('npm run test:unit')
  })

  it('keeps the old verdict for any other workflow without a job list', () => {
    const c = classifyFailureCause({ workflowName: 'CI', conclusion: 'failure', jobs: null })
    expect(c.cause).toBe('repository')
    expect(c.remedy).toContain('npm run test:unit')
  })

  it('never throws on junk input', () => {
    expect(() => classifyFailureCause()).not.toThrow()
    expect(classifyFailureCause({ jobs: 'nonsense' }).cause).toBe('repository')
    expect(classifyFailureCause(null).cause).toBe('repository')
  })
})
