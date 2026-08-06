// Vitest coverage for the pure red-cause classifier (ci-failure-cause-core.mjs):
// a Pages deploy stuck on GitHub's side is told apart from a failing build, a
// cancellation is nobody's fixing push, and an unreadable job list is reported
// as unknown rather than guessed.
import { describe, it, expect } from 'vitest'
import {
  PAGES_WORKFLOW,
  classifyFailureCause,
  failedJobNames,
  ranNothingOfOurs,
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

  // Point 528: the name list was a guess about the world and the world moved.
  // The observation "no step of ours ran" holds in outages nobody has seen yet.
  describe('a job that executed no step of ours', () => {
    // The workflow files are PROVEN untouched unless a case says otherwise —
    // without that proof the same shape might be a workflow file we broke.
    const died = (name, steps, workflowsUntouched = true) => ({
      workflowName: 'CI',
      conclusion: 'failure',
      workflowsUntouched,
      jobs: [job({ name, conclusion: 'failure', steps })],
    })

    it('reads the real 06.08.2026 outage as external, not as our defect', () => {
      // Verbatim shape of run 31120476902: the runner never resolved the actions.
      const r = classifyFailureCause(died('fast', [{ name: 'Set up job', conclusion: 'failure' }]))
      expect(r.cause).toBe('external')
      expect(r.detail).toContain('executed no step of ours')
      expect(r.remedy).toContain('No push in this repository can clear this')
      // It must NOT send the session to reproduce a fast gate that would pass.
      expect(r.remedy).not.toContain('npm run test:unit')
      // Nor to the Pages unblock, which would cancel nothing here.
      expect(r.remedy).not.toContain('pages-deploy-unblock')
    })

    it('reads a job that never got a runner as external', () => {
      expect(classifyFailureCause(died('deploy', [])).cause).toBe('external')
    })

    it('counts the runner teardown as the runner\'s, not ours', () => {
      const r = classifyFailureCause(
        died('fast', [
          { name: 'Set up job', conclusion: 'failure' },
          { name: 'Post Checkout', conclusion: 'success' },
          { name: 'Complete job', conclusion: 'success' },
        ]),
      )
      expect(r.cause).toBe('external')
    })

    it('still blames the repository the moment one step of ours ran', () => {
      const r = classifyFailureCause(
        died('fast', [
          { name: 'Set up job', conclusion: 'success' },
          { name: 'Run the fast gate', conclusion: 'failure' },
        ]),
      )
      expect(r.cause).toBe('repository')
      expect(r.remedy).toContain('npm run test:unit')
    })

    it('never invents the excuse where the steps cannot be seen', () => {
      // No `steps` key at all: the guard must not claim nothing of ours ran.
      expect(classifyFailureCause(died('fast', undefined)).cause).toBe('repository')
      expect(ranNothingOfOurs({ name: 'fast' })).toBe(false)
      expect(ranNothingOfOurs(null)).toBe(false)
    })

    it('needs EVERY failed job to be blameless before it excuses the run', () => {
      const r = classifyFailureCause({
        workflowName: 'CI',
        conclusion: 'failure',
        jobs: [
          job({ name: 'fast', conclusion: 'failure', steps: [{ name: 'Set up job' }] }),
          job({ name: 'slow', conclusion: 'failure', steps: [{ name: 'Run the suite' }] }),
        ],
      })
      expect(r.cause).toBe('repository')
    })

    // The four-eyes review's F1: a `uses:` that resolves nowhere, or a `runs-on`
    // no runner matches, dies in `Set up job` with no step of ours — identical to
    // the outage, but fixable ONLY by a push. Excusing it would loop forever.
    it('refuses to excuse the same shape when a workflow file may be the cause', () => {
      const r = classifyFailureCause(died('fast', [{ name: 'Set up job', conclusion: 'failure' }], false))
      expect(r.cause).toBe('unknown')
      expect(r.actionable).not.toBe(false) // still blocks
      expect(r.detail).toContain('broken workflow FILE')
      expect(r.remedy).toContain('.github/workflows/')
    })

    it('treats an UNPROVEN workflow state as unproven, never as untouched', () => {
      for (const unproven of [undefined, null, 'true', 1, {}]) {
        const r = classifyFailureCause({
          workflowName: 'CI',
          conclusion: 'failure',
          workflowsUntouched: unproven,
          jobs: [job({ name: 'fast', conclusion: 'failure', steps: [{ name: 'Set up job' }] })],
        })
        expect(r.actionable).not.toBe(false)
      }
    })

    it('counts only the runner\'s own set-up, not a step of ours that starts with "post"', () => {
      const r = classifyFailureCause(
        died('fast', [{ name: 'Set up job' }, { name: 'Postgres wait', conclusion: 'failure' }]),
      )
      expect(r.cause).toBe('repository')
    })

    it('knows the larger runners\' set-up step too', () => {
      const r = classifyFailureCause(
        died('fast', [{ name: 'Set up runner' }, { name: 'Set up job', conclusion: 'failure' }]),
      )
      expect(r.cause).toBe('external')
    })

    it('is the ONLY cause marked unactionable — everything else still blocks', () => {
      // `actionable: false` is what lets the guard report instead of holding the
      // turn end. It must stay confined to the famine, or a real defect walks.
      expect(classifyFailureCause(died('fast', [{ name: 'Set up job' }])).actionable).toBe(false)

      const stillBlocking = [
        died('fast', [{ name: 'Set up job' }, { name: 'Run the suite', conclusion: 'failure' }]),
        died('fast', [{ name: 'Set up job' }], false), // workflow file unproven
        { workflowName: 'CI', conclusion: 'cancelled', jobs: null },
        { workflowName: PAGES_WORKFLOW, conclusion: 'cancelled', jobs: null },
        { workflowName: PAGES_WORKFLOW, conclusion: 'failure', jobs: null },
        { workflowName: 'CI', conclusion: 'failure', jobs: null },
        // The Pages stall: it RAN and failed, and its remedy — the cancel
        // command — is something this machine can do, so it must keep blocking.
        // Without this input the branch is unreached and the claim is vacuous.
        {
          workflowName: PAGES_WORKFLOW,
          conclusion: 'failure',
          jobs: [
            job({ name: 'build', conclusion: 'success', steps: [{ name: 'Build' }] }),
            job({
              name: 'deploy',
              conclusion: 'failure',
              steps: [{ name: 'Set up job' }, { name: 'Deploy to GitHub Pages', conclusion: 'failure' }],
            }),
          ],
        },
      ]
      for (const input of stillBlocking) {
        expect(classifyFailureCause(input).actionable).not.toBe(false)
      }
    })

    it('leaves the Pages stall on its own path, with its own remedy', () => {
      // The deploy job RAN and failed talking to the Pages API — a real stall,
      // which the famine rule must not swallow.
      const r = classifyFailureCause({
        workflowName: PAGES_WORKFLOW,
        conclusion: 'failure',
        jobs: [
          job({ name: 'build', conclusion: 'success', steps: [{ name: 'Build' }] }),
          job({
            name: 'deploy',
            conclusion: 'failure',
            steps: [{ name: 'Set up job' }, { name: 'Deploy to GitHub Pages', conclusion: 'failure' }],
          }),
        ],
      })
      expect(r.cause).toBe('external')
      expect(r.remedy).toContain('pages-deploy-unblock.mjs --cancel')
    })
  })
})
