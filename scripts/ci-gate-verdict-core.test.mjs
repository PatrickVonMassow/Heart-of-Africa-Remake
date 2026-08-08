// The branch run that must not mail the owner (point 513).
//
// Two things are pinned here, because the mechanism is only as good as its
// weakest half: the pure VERDICT (who mails, what is reported) and the WORKFLOW
// that arms it. A correct core beside a `ci.yml` that lost one
// `continue-on-error` would mail again on exactly the step that lost it, and
// nothing in the repository would notice — GitHub is the only place that failure
// shows, and the mail is the thing we cannot observe from here.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  NOT_RUN,
  SOFT_EVENT,
  SOFT_REF_PREFIX,
  annotations,
  commitStatus,
  isSoftRun,
  mailsOnFailure,
  parseOutcomes,
  renderSummary,
  stepOutputs,
  verdict,
} from './ci-gate-verdict-core.mjs'

const HERE = resolve(process.cwd(), 'scripts')
const WORKFLOW = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')

/** The one expression that makes a step unable to fail the job. */
const SOFT_EXPR = "continue-on-error: ${{ github.event_name == 'push' && startsWith(github.ref, 'refs/heads/feat/') }}"

const BRANCH = { event: 'push', ref: 'refs/heads/feat/513-branch-ci-no-mail' }
const MAIN = { event: 'push', ref: 'refs/heads/main' }

describe('isSoftRun / mailsOnFailure', () => {
  it('a routine push to a feature branch is soft', () => {
    expect(isSoftRun(BRANCH)).toBe(true)
    expect(mailsOnFailure(BRANCH)).toBe(false)
  })

  it('main keeps the mail — it is the branch the deploy builds from', () => {
    expect(isSoftRun(MAIN)).toBe(false)
    expect(mailsOnFailure(MAIN)).toBe(true)
  })

  it('a deliberate trigger keeps the mail on any branch', () => {
    // A manual dispatch or a pull request is somebody ASKING for the verdict;
    // only the automatic per-commit push is routine enough to be silenced.
    expect(isSoftRun({ event: 'workflow_dispatch', ref: BRANCH.ref })).toBe(false)
    expect(isSoftRun({ event: 'pull_request', ref: 'refs/pull/7/merge' })).toBe(false)
  })

  it('does not silence a branch that merely looks like one', () => {
    expect(isSoftRun({ event: 'push', ref: 'refs/heads/feature/513' })).toBe(false)
    expect(isSoftRun({ event: 'push', ref: 'refs/heads/board' })).toBe(false)
    expect(isSoftRun({ event: 'push', ref: 'refs/tags/v0.3' })).toBe(false)
  })

  it('never throws on nonsense', () => {
    expect(isSoftRun()).toBe(false)
    expect(isSoftRun({ event: null, ref: undefined })).toBe(false)
    expect(mailsOnFailure({})).toBe(true)
  })

  it('exports the shape the workflow spells out', () => {
    expect(SOFT_EVENT).toBe('push')
    expect(SOFT_REF_PREFIX).toBe('refs/heads/feat/')
  })
})

describe('parseOutcomes', () => {
  it('reads the step=outcome pairs in order', () => {
    expect(parseOutcomes('install=success build=failure unit=skipped')).toEqual([
      { step: 'install', outcome: 'success' },
      { step: 'build', outcome: 'failure' },
      { step: 'unit', outcome: 'skipped' },
    ])
  })

  it('a step that never reported reads as not-run, not as a failure', () => {
    expect(parseOutcomes('build= lint=success')[0]).toEqual({ step: 'build', outcome: NOT_RUN })
    expect(verdict({ ...BRANCH, outcomes: 'build= lint=success' }).ok).toBe(true)
  })

  it('ignores junk instead of throwing', () => {
    expect(parseOutcomes('   ')).toEqual([])
    expect(parseOutcomes('=orphan build=success')).toEqual([{ step: 'build', outcome: 'success' }])
    expect(parseOutcomes(null)).toEqual([])
  })
})

describe('verdict', () => {
  it('names every failed step, in gate order', () => {
    const v = verdict({ ...BRANCH, outcomes: 'install=success build=failure lint=success audit=failure unit=skipped' })
    expect(v.failed).toEqual(['build', 'audit'])
    expect(v.failedSteps).toBe('build, audit')
    expect(v.ok).toBe(false)
  })

  it('a red branch run does NOT mail; a red main run does', () => {
    expect(verdict({ ...BRANCH, outcomes: 'build=failure' }).mails).toBe(false)
    expect(verdict({ ...MAIN, outcomes: 'build=failure' }).mails).toBe(true)
  })

  it('a green run mails nobody, whatever the branch', () => {
    expect(verdict({ ...MAIN, outcomes: 'build=success unit=success' }).mails).toBe(false)
  })

  it('a cancelled step is a superseded run, not a broken tree', () => {
    // `cancel-in-progress` supersedes the previous run on every new push, so
    // treating `cancelled` as a gate failure would alert on ordinary work.
    const v = verdict({ ...BRANCH, outcomes: 'build=cancelled lint=cancelled' })
    expect(v.ok).toBe(true)
    expect(v.failed).toEqual([])
  })

  it('knows main by the same constant the pre-push gate uses', () => {
    expect(verdict(MAIN).protectedRef).toBe(true)
    expect(verdict(BRANCH).protectedRef).toBe(false)
  })

  it('accepts an already-parsed outcome list', () => {
    expect(verdict({ ...BRANCH, outcomes: [{ step: 'unit', outcome: 'failure' }] }).failed).toEqual(['unit'])
  })
})

describe('the report', () => {
  it('the soft summary says the green tick is not a green gate', () => {
    const text = renderSummary(verdict({ ...BRANCH, outcomes: 'build=failure' }), { runUrl: 'https://run/1' })
    expect(text).toContain('FAILED')
    expect(text).toMatch(/concludes GREEN/)
    expect(text).toContain('build')
    expect(text).toContain('https://run/1')
  })

  it('a hard failure is reported without that caveat', () => {
    const text = renderSummary(verdict({ ...MAIN, outcomes: 'unit=failure' }))
    expect(text).toContain('CI gate: FAILED')
    expect(text).not.toMatch(/concludes GREEN/)
  })

  it('annotates each failed step and nothing on a pass', () => {
    expect(annotations(verdict({ ...BRANCH, outcomes: 'build=failure unit=failure' }))).toEqual([
      `::error title=CI branch gate failed::build failed on ${BRANCH.ref}`,
      `::error title=CI branch gate failed::unit failed on ${BRANCH.ref}`,
    ])
    expect(annotations(verdict({ ...BRANCH, outcomes: 'build=success' }))).toEqual([])
    expect(annotations(null)).toEqual([])
  })

  it('posts a commit status only for the run whose conclusion cannot tell the truth', () => {
    const red = commitStatus(verdict({ ...BRANCH, outcomes: 'lint=failure' }), { runUrl: 'https://run/2' })
    expect(red).toMatchObject({ state: 'failure', context: 'ci/gate (branch)', target_url: 'https://run/2' })
    expect(red.description).toContain('lint')
    expect(commitStatus(verdict({ ...BRANCH, outcomes: 'lint=success' })).state).toBe('success')
    expect(commitStatus(verdict({ ...MAIN, outcomes: 'lint=failure' }))).toBeNull()
  })

  it('hands the following steps a machine-readable verdict', () => {
    expect(stepOutputs(verdict({ ...BRANCH, outcomes: 'build=failure' }))).toEqual([
      'failed=true',
      'failedSteps=build',
      'mails=false',
    ])
    expect(stepOutputs(verdict({ ...MAIN, outcomes: 'build=failure' }))).toContain('mails=true')
    expect(stepOutputs(verdict({ ...MAIN, outcomes: 'build=success' }))).toContain('failed=false')
  })
})

describe('the workflow that arms it', () => {
  const stepLines = WORKFLOW.split('\n').filter((l) => /^ {6}- /.test(l))
  const softLines = WORKFLOW.split('\n').filter((l) => l.trim().startsWith('continue-on-error:'))

  it('still runs on main and on the feature branches', () => {
    expect(WORKFLOW).toContain("branches: [main, 'feat/**']")
  })

  it('EVERY step of the job can be soft — one missed step mails again', () => {
    expect(stepLines.length).toBeGreaterThan(5)
    expect(softLines.length).toBe(stepLines.length)
    for (const line of softLines) expect(line.trim()).toBe(SOFT_EXPR)
  })

  it('the verdict step runs whatever happened before it', () => {
    expect(WORKFLOW).toMatch(/id: verdict[\s\S]*?if: always\(\)/)
    expect(WORKFLOW).toContain('node scripts/ci-gate-verdict.mjs')
    expect(WORKFLOW).toContain('GATE_OUTCOMES: install=${{ steps.install.outcome }}')
  })

  it('EVERY gate step is announced to the verdict, and only real steps are', () => {
    // The load-bearing pairing, and the one the rest of this suite cannot see:
    // `steps.<id>.outcome` for a step that has no id — or a step nobody added to
    // `GATE_OUTCOMES` — evaluates to the empty string, the core reads it as
    // NOT_RUN (which is deliberately not a failure), and a genuinely red gate
    // comes out green, green-statused and unalerted with every test still
    // passing. So the two sets are compared in BOTH directions: a dropped `id:`
    // and an unannounced step must each fail here.
    const lines = WORKFLOW.split('\n')
    const verdictAt = lines.findIndex((l) => l.trim() === '- id: verdict')
    expect(verdictAt).toBeGreaterThan(0)
    const ids = lines.slice(0, verdictAt).flatMap((l) => {
      const m = /^ {6}- id: (\S+)$/.exec(l)
      return m ? [m[1]] : []
    })
    const value = /^\s*GATE_OUTCOMES: (.*)$/m.exec(WORKFLOW)?.[1] ?? ''
    const announced = [...value.matchAll(/(\S+)=\$\{\{ steps\.(\S+)\.outcome \}\}/g)].map(([, label, step]) => {
      // A label pointing at another step's outcome would report the wrong one.
      expect(label).toBe(step)
      return label
    })
    expect(ids.length).toBeGreaterThan(3)
    expect(announced.slice().sort()).toEqual(ids.slice().sort())
  })

  it('the ntfy alert keys off the verdict, which a soft run alone reaches', () => {
    expect(WORKFLOW).toContain("steps.verdict.outputs.failed == 'true'")
  })

  it('may write the commit status the soft run needs', () => {
    expect(WORKFLOW).toMatch(/permissions:[\s\S]*?statuses: write/)
  })
})

describe('the wrapper, driven for real', () => {
  function run(env) {
    const dir = mkdtempSync(join(tmpdir(), 'ci-gate-verdict-'))
    const summary = join(dir, 'summary.md')
    const output = join(dir, 'output.txt')
    try {
      execFileSync(process.execPath, [join(HERE, 'ci-gate-verdict.mjs')], {
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: summary,
          GITHUB_OUTPUT: output,
          GITHUB_TOKEN: '',
          GATE_RUN_URL: 'https://run/3',
          ...env,
        },
        encoding: 'utf8',
        stdio: 'pipe',
        windowsHide: true,
      })
      return { summary: readFileSync(summary, 'utf8'), output: readFileSync(output, 'utf8') }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('a red branch run exits 0 and writes the whole finding down', () => {
    // execFileSync throws on a non-zero exit, so "it exits 0" is asserted by the
    // call returning at all — which is the property the mail depends on.
    const { summary, output } = run({
      GATE_EVENT: 'push',
      GATE_REF: BRANCH.ref,
      GATE_OUTCOMES: 'install=success build=failure lint=success audit=success unit=skipped',
    })
    expect(summary).toContain('concludes GREEN')
    expect(summary).toContain('build')
    expect(output).toContain('failed=true')
    expect(output).toContain('mails=false')
  })

  it('a red main run reports that the mail goes out', () => {
    const { output } = run({ GATE_EVENT: 'push', GATE_REF: 'refs/heads/main', GATE_OUTCOMES: 'unit=failure' })
    expect(output).toContain('failed=true')
    expect(output).toContain('mails=true')
  })

  it('survives an empty environment rather than failing the job it reports on', () => {
    const { output } = run({ GATE_EVENT: '', GATE_REF: '', GATE_OUTCOMES: '' })
    expect(output).toContain('failed=false')
  })
})
