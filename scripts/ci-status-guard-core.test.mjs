// Vitest coverage for the pure CI-status decision logic (ci-status-guard-core.mjs):
// red blocks and notifies once per sha, pending/success/none allow, malformed
// input fails open, and a green re-run supersedes its red predecessor.
import { describe, it, expect } from 'vitest'
import { assessCiWait } from './batch-in-flight-core.mjs'
import { ciTerminalPrompt, successorStartDecision, SUCCESSOR_TRIGGERS } from './batch-autostart-core.mjs'
import {
  acknowledgeCiWaitState,
  blockReason,
  cachedAnswer,
  ciWaitBackoffMs,
  ciWaitIdentity,
  ciRedAlertMessage,
  blockingRunIds,
  chargedReportsDue,
  chargedRunIds,
  classifyRuns,
  observedShaEntry,
  observerClassification,
  GATE_STATUS_CONTEXT,
  readAllStatusPages,
  refBranch,
  targetBranch,
  waitTarget,
  withGateStatuses,
  failedRuns,
  notifiedFromState,
  pruneFamine,
  pruneNotifiedRefs,
  pruneShaCache,
  pushedRefsFromReflog,
  recoveredWorkflows,
  refTargets,
  selectCiTargets,
  refVerdict,
  reconcileCiWait,
  renewCiWait,
  shouldNotify,
  observeCiWait,
  sweepTargets,
  FAMINE_TTL_MS,
  PUSH_WINDOW_MS,
  RECHECK_MS,
  RUN_GRACE_MS,
  WAIT_BUDGET_MS,
} from './ci-status-guard-core.mjs'

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
    expect(failedRuns(runs, HEAD).length > 0).toBe(classifyRuns(runs, HEAD).state === 'failed')
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

  // THE BRANCHING FALSE RED (measured 21.08.2026). Creating feat/<point> at
  // main's tip pushes main's sha a second time; GitHub starts a second "CI" run
  // for it, and the author's first commit cancels that run through
  // `concurrency: cancel-in-progress`. The cancellation is NEWER than main's own
  // concluded run, so "newest id wins" reported origin/main RED against a sha
  // whose CI had SUCCEEDED — and demanded a fixing push no code could supply.
  it('lets a concluded run outrank a newer cancellation on the same sha', () => {
    const green = run({ databaseId: 10, conclusion: 'success' })
    const supersededByBranch = run({ databaseId: 11, conclusion: 'cancelled' })
    expect(classifyRuns([green, supersededByBranch], HEAD).state).toBe('success')
    expect(failedRuns([green, supersededByBranch], HEAD)).toEqual([])
    expect(recoveredWorkflows([green, supersededByBranch], HEAD)).toEqual(['CI'])
  })

  // A cancellation is only noise when something else JUDGED. Alone it still
  // demands attention, and it must never bury a genuine red standing behind it.
  // A soft feat/** run concludes success while its gate is red; only the
  // ci/gate (branch) commit status carries the verdict (run 38277768235).
  const RUN_PAGE = 'https://github.com/o/r/actions/runs/1'
  const gate = (state, over = {}) => ({
    context: GATE_STATUS_CONTEXT,
    state,
    target_url: RUN_PAGE,
    description: `gate ${state}: unit`,
    ...over,
  })
  const feat = (over = {}) => run({ headBranch: 'feat/x', ...over })
  const onFeat = (statuses) => ({ statuses, branch: 'feat/x' })

  it('classifies a success-concluded run with a failing ci/gate status as red', () => {
    const c = classifyRuns([feat()], HEAD, onFeat([gate('failure')]))
    expect(c).toMatchObject({ state: 'failed', runId: 1, workflowName: 'CI', conclusion: 'failure' })
    expect(classifyRuns([feat()], HEAD, onFeat([gate('error')])).state).toBe('failed')
    expect(failedRuns([feat()], HEAD, onFeat([gate('failure')]))).toHaveLength(1)
    expect(recoveredWorkflows([feat()], HEAD, onFeat([gate('failure')]))).toEqual([])
  })

  // Review P1 (13.10.2026): the REST shape carries BOTH `url` (the API endpoint)
  // and `html_url`; the status names the html_url, so `url` must not win.
  it('matches the REST shape by html_url, not by its API url', () => {
    const rest = {
      id: 1, head_sha: HEAD, head_branch: 'feat/x', status: 'completed', conclusion: 'success', name: 'CI',
      url: 'https://api.github.com/repos/o/r/actions/runs/1', html_url: RUN_PAGE,
    }
    expect(classifyRuns([rest], HEAD, onFeat([gate('failure')])).state).toBe('failed')
  })

  it('judges the gate by the newest status of the same run, and only that run', () => {
    // GitHub lists statuses newest first: a re-run's green supersedes the old red.
    expect(classifyRuns([feat()], HEAD, onFeat([gate('success'), gate('failure')])).state).toBe('success')
    expect(classifyRuns([feat()], HEAD, onFeat([gate('failure'), gate('success')])).state).toBe('failed')
    // A red status of an OLDER run cannot paint a newer green run red.
    const other = gate('failure', { target_url: 'https://github.com/o/r/actions/runs/0' })
    expect(classifyRuns([feat()], HEAD, onFeat([other])).state).toBe('success')
    // Other contexts are not the gate.
    expect(classifyRuns([feat()], HEAD, onFeat([gate('failure', { context: 'ci/other' })])).state).toBe('success')
    expect(classifyRuns([feat({ status: 'in_progress', conclusion: null })], HEAD, onFeat([gate('failure')])).state).toBe('pending')
  })

  // Review P2 (13.10.2026): a feature branch created at main's tip shares main's
  // sha, and refTargets gives that sha to main. A red feature gate must not
  // paint main red; the feature target itself still reads red.
  it('keeps main unchanged on a sha it shares with a red-gated feature run', () => {
    const mainRun = run({ databaseId: 1, headBranch: 'main', url: 'https://github.com/o/r/actions/runs/1' })
    const featRun = feat({ databaseId: 2, url: 'https://github.com/o/r/actions/runs/2' })
    const statuses = [gate('failure', { target_url: 'https://github.com/o/r/actions/runs/2' })]
    expect(classifyRuns([mainRun, featRun], HEAD, { statuses, branch: 'main' }).state).toBe('success')
    expect(classifyRuns([mainRun, featRun], HEAD, { statuses, branch: 'feat/x' }).state).toBe('failed')
    // No gate input at all: exactly the old conclusion-only reading.
    expect(classifyRuns([mainRun, featRun], HEAD).state).toBe('success')
    expect(refBranch('origin/feat/x')).toBe('feat/x')
    expect(refBranch('origin/main')).toBe('main')
  })

  it('sweeps a shared sha under main green and under the feature ref red', async () => {
    const featRun = feat({ databaseId: 2, url: 'https://github.com/o/r/actions/runs/2' })
    const runs = withGateStatuses(
      [run({ databaseId: 1, headBranch: 'main' }), featRun],
      [gate('failure', { target_url: 'https://github.com/o/r/actions/runs/2' })],
    )
    const sweep = (ref) => sweepTargets({
      targets: [{ ref, sha: HEAD, at: 1 }],
      cache: {}, notified: {}, famine: {}, now: 10 * 60 * 1000,
      fetchRuns: async () => runs,
      judgeRed: async ({ classification }) => ({ classification, standDown: false }),
      notify: async () => {},
    })
    expect((await sweep('origin/main')).cache[HEAD].state).toBe('success')
    expect((await sweep('origin/feat/x')).cache[HEAD].state).toBe('failed')
  })

  // Review round 2 (13.10.2026): three ways a branch identity got lost.
  const sweepOnce = (target, runs, cache = {}) => {
    const asked = []
    return sweepTargets({
      targets: [target],
      cache, notified: {}, famine: {}, now: 10 * 60 * 1000,
      fetchRuns: async (sha) => { asked.push(sha); return runs },
      judgeRed: async ({ classification }) => ({ classification, standDown: false }),
      notify: async () => {},
    }).then((result) => ({ ...result, asked }))
  }
  const sharedSha = () => withGateStatuses(
    [run({ databaseId: 1, headBranch: 'main' }), feat({ databaseId: 2, url: 'https://github.com/o/r/actions/runs/2' })],
    [gate('failure', { target_url: 'https://github.com/o/r/actions/runs/2' })],
  )

  it('does not let a sha cached green under main skip the feature branch that later owns it', async () => {
    const asMain = await sweepOnce({ ref: 'origin/main', sha: HEAD, at: 1 }, sharedSha())
    expect(asMain.cache[HEAD]).toMatchObject({ state: 'success', branch: 'main' })
    // Same branch again: still a free cache hit.
    expect((await sweepOnce({ ref: 'origin/main', sha: HEAD, at: 1 }, sharedSha(), asMain.cache)).asked).toEqual([])
    // main moved on, feat/x now owns the sha: asked again, and red.
    const asFeat = await sweepOnce({ ref: 'origin/feat/x', sha: HEAD, at: 1 }, sharedSha(), asMain.cache)
    expect(asFeat.asked).toEqual([HEAD])
    expect(asFeat.cache[HEAD].state).toBe('failed')
  })

  it('does not let another branch\'s newer run supersede the target\'s red gate, in either order', () => {
    const urls = (id) => `https://github.com/o/r/actions/runs/${id}`
    const statuses = [gate('failure', { target_url: urls(1) }), gate('failure', { target_url: urls(2) })]
    for (const [xId, yId] of [[1, 2], [2, 1]]) {
      const runs = [
        run({ databaseId: xId, headBranch: 'feat/x', url: urls(xId) }),
        run({ databaseId: yId, headBranch: 'feat/y', url: urls(yId) }),
      ]
      expect(classifyRuns(runs, HEAD, { statuses, branch: 'feat/x' }).state).toBe('failed')
      expect(classifyRuns(runs, HEAD, { statuses, branch: 'feat/y' }).state).toBe('failed')
      expect(failedRuns(runs, HEAD, { statuses, branch: 'feat/x' })).toHaveLength(1)
    }
    // A green re-run of the target's OWN branch still supersedes its red.
    const rerun = [feat({ databaseId: 1 }), feat({ databaseId: 3, url: urls(3) })]
    expect(classifyRuns(rerun, HEAD, onFeat([gate('failure')])).state).toBe('success')
  })

  it('keeps the real branch of a HEAD pushed from another clone, through the sweep and the wait', async () => {
    const [target] = refTargets({ headSha: HEAD, headPushed: true, headBranch: 'feat/x' })
    expect(target).toEqual({ ref: 'HEAD', sha: HEAD, at: 0, branch: 'feat/x' })
    expect(refTargets({ headSha: HEAD, headPushed: true })).toEqual([{ ref: 'HEAD', sha: HEAD, at: 0 }])
    const soft = withGateStatuses([feat()], [gate('failure')])
    expect((await sweepOnce(target, soft)).cache[HEAD].state).toBe('failed')
    const wait = renewCiWait(null, {
      target,
      classification: { state: 'pending', workflowName: 'CI', runId: 1 },
      firstSeenAt: 0,
      observedAt: 0,
    }, { now: 0, makeWakeToken: () => 'wake' })
    expect(targetBranch(wait)).toBe('feat/x')
    expect(classifyRuns(soft, HEAD, { branch: targetBranch(wait) }).state).toBe('failed')
    // Review P2 (13.10.2026): a pending renewal from the wait keeps the branch.
    for (const runId of [1, 2]) {
      const renewed = renewCiWait(runId === 1 ? wait : null, {
        target: waitTarget(wait),
        classification: { state: 'pending', workflowName: 'CI', runId },
        firstSeenAt: 0,
        observedAt: 1,
      }, { now: 1, makeWakeToken: () => 'wake' })
      expect(targetBranch(renewed)).toBe('feat/x')
      expect(classifyRuns(soft, HEAD, { branch: targetBranch(renewed) }).state).toBe('failed')
    }
  })

  // Review P2 (13.10.2026): a red gate on an unread page must not pass as green.
  it('reads every status page, and an incomplete read is unreadable', async () => {
    const pages = { 1: Array(100).fill(gate('success')), 2: [gate('failure')] }
    expect(await readAllStatusPages(async (n) => pages[n] ?? [])).toHaveLength(101)
    expect(await readAllStatusPages(async (n) => (n === 1 ? pages[1] : null))).toBeNull()
    expect(await readAllStatusPages(async () => Array(100).fill(gate('success')), { maxPages: 3 })).toBeNull()
  })

  it('keeps a lone cancellation red, and never hides a real failure', () => {
    expect(classifyRuns([run({ conclusion: 'cancelled' })], HEAD).state).toBe('failed')
    const red = run({ databaseId: 10, conclusion: 'failure' })
    const newerCancel = run({ databaseId: 11, conclusion: 'cancelled' })
    const c = classifyRuns([red, newerCancel], HEAD)
    expect(c.state).toBe('failed')
    expect(c.conclusion).toBe('failure')
  })

  // The rule is per workflow: a green "CI" says nothing about a cancelled
  // "Deploy to GitHub Pages" that reached no other verdict.
  it('does not let one workflow\'s verdict excuse another\'s cancellation', () => {
    const ciGreen = run({ databaseId: 10, conclusion: 'success', workflowName: 'CI' })
    const deployCancelled = run({ databaseId: 11, conclusion: 'cancelled', workflowName: 'Deploy to GitHub Pages' })
    const c = classifyRuns([ciGreen, deployCancelled], HEAD)
    expect(c.state).toBe('failed')
    expect(c.workflowName).toBe('Deploy to GitHub Pages')
  })

  // An unfinished run has reached no verdict either, so it cannot excuse one.
  it('does not let a still-running run excuse a cancellation', () => {
    const running = run({ databaseId: 10, status: 'in_progress', conclusion: null })
    const cancelled = run({ databaseId: 11, conclusion: 'cancelled' })
    expect(classifyRuns([running, cancelled], HEAD).state).toBe('failed')
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

describe('shouldNotify', () => {
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
    expect(reason).toContain('batch-pause.mjs --user-stop')
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

// ---------------------------------------------------------------------------
// CONFIRM GREEN ON EVERY PUSHED REF (point 387). The guard asked about HEAD
// alone, so the owning session's green `main` hid thirteen red branch runs
// through the night of 30.07.2026 — only the repository owner's inbox learned.
// ---------------------------------------------------------------------------

const BRANCH = 'feed0011223344'
const NOW = 1_800_000_000_000
const t = (s) => NOW - s * 1000

const reflog = (lines) => lines.join('\n')
const pushLine = (ref, sha, at, msg = 'update by push') =>
  `refs/remotes/${ref}@{${Math.floor(at / 1000)}}\t${sha}\t${msg}`

describe('pushedRefsFromReflog', () => {
  it('takes the refs THIS repository pushed, newest push per ref', () => {
    const got = pushedRefsFromReflog(
      reflog([
        pushLine('origin/feat/x', BRANCH, t(60)),
        pushLine('origin/feat/x', 'older00', t(600)),
        pushLine('origin/main', HEAD, t(300)),
      ]),
      { now: NOW },
    )
    expect(got).toEqual([
      { ref: 'origin/feat/x', sha: BRANCH, at: t(60) },
      { ref: 'origin/main', sha: HEAD, at: t(300) },
    ])
  })

  it('ignores a FETCH — someone else’s branch is not this session’s duty', () => {
    expect(
      pushedRefsFromReflog(
        reflog([
          pushLine('origin/other', 'aaa111', t(60), 'fetch: fast-forward'),
          `refs/heads/main@{${Math.floor(t(60) / 1000)}}\tbbb222\tcommit: local work`,
          `HEAD@{${Math.floor(t(60) / 1000)}}\tbbb222\tcheckout: moving`,
        ]),
        { now: NOW },
      ),
    ).toEqual([])
  })

  it('drops pushes older than the window, and survives junk', () => {
    expect(pushedRefsFromReflog(reflog([pushLine('origin/old', 'aaa111', NOW - PUSH_WINDOW_MS - 1)]), { now: NOW })).toEqual([])
    expect(pushedRefsFromReflog(null, { now: NOW })).toEqual([])
    expect(pushedRefsFromReflog('garbage\n\n', { now: NOW })).toEqual([])
  })
})

describe('refTargets', () => {
  const pushed = [
    { ref: 'origin/feat/x', sha: BRANCH, at: t(60) },
    { ref: 'origin/main', sha: HEAD, at: t(300) },
  ]

  it('leads with HEAD’s own sha, then the rest newest first', () => {
    expect(refTargets({ pushed, existingRefs: ['origin/main', 'origin/feat/x'], headSha: HEAD }).map((x) => x.ref)).toEqual([
      'origin/main',
      'origin/feat/x',
    ])
  })

  it('DROPS a ref that no longer exists — a merged branch is not reported forever', () => {
    const got = refTargets({ pushed, existingRefs: ['origin/main'], headSha: HEAD })
    expect(got.map((x) => x.ref)).toEqual(['origin/main'])
  })

  it('asks about a sha ONCE even when two refs carry it', () => {
    const got = refTargets({
      pushed: [
        { ref: 'origin/main', sha: HEAD, at: t(60) },
        { ref: 'origin/release', sha: HEAD, at: t(90) },
      ],
      existingRefs: ['origin/main', 'origin/release'],
      headSha: HEAD,
    })
    expect(got).toHaveLength(1)
  })

  it('keeps main as the owner of a shared sha even when the feature push is newer', () => {
    const got = refTargets({
      pushed: [
        { ref: 'origin/feat/x', sha: HEAD, at: t(30) },
        { ref: 'origin/main', sha: HEAD, at: t(60) },
      ],
      existingRefs: ['origin/main', 'origin/feat/x'],
      headSha: HEAD,
    })
    expect(got).toEqual([{ ref: 'origin/main', sha: HEAD, at: t(60) }])
  })

  it('keeps the old guarantee: a HEAD pushed from another clone is still judged', () => {
    const got = refTargets({ pushed: [], existingRefs: [], headSha: HEAD, headPushed: true })
    expect(got).toEqual([{ ref: 'HEAD', sha: HEAD, at: 0 }])
    // …and nothing is claimed when HEAD was never pushed at all.
    expect(refTargets({ pushed: [], existingRefs: [], headSha: HEAD, headPushed: false })).toEqual([])
  })
})

describe('selectCiTargets', () => {
  const main = { ref: 'origin/main', sha: HEAD, at: t(120) }
  const candidate = { ref: 'origin/feat/669-rescue', sha: BRANCH, at: t(60) }

  it('always gates main, even if a malformed declaration names it', () => {
    expect(selectCiTargets({ targets: [main], liveAuthorBranches: ['main'] })[0].disposition).toBe('gate')
  })

  it('gates a landing candidate whose author is no longer declared', () => {
    expect(selectCiTargets({ targets: [candidate], liveAuthorBranches: [] })[0].disposition).toBe('gate')
  })

  it('reports without gating while that exact branch has a live author', () => {
    expect(
      selectCiTargets({ targets: [candidate], liveAuthorBranches: ['refs/heads/feat/669-rescue'] })[0].disposition,
    ).toBe('report')
  })

  it('gates the branch again the moment its author declaration is gone', () => {
    const live = selectCiTargets({ targets: [candidate], liveAuthorBranches: ['origin/feat/669-rescue'] })
    const gone = selectCiTargets({ targets: [candidate], liveAuthorBranches: [] })
    expect(live[0].disposition).toBe('report')
    expect(gone[0].disposition).toBe('gate')
  })
})

describe('notifiedFromState / pruneNotifiedRefs', () => {
  it('migrates the single-sha form the file used while only HEAD was watched', () => {
    expect(notifiedFromState({ notifiedSha: 'aaa111' })).toEqual({ HEAD: 'aaa111' })
    expect(notifiedFromState({ notifiedRefs: { 'origin/main': 'bbb222' }, notifiedSha: 'aaa111' })).toEqual({
      'origin/main': 'bbb222',
    })
    expect(notifiedFromState(undefined)).toEqual({})
  })

  it('forgets the bookkeeping of a ref that no longer exists', () => {
    expect(
      pruneNotifiedRefs({ 'origin/main': 'a', 'origin/gone': 'b', HEAD: 'c' }, ['origin/main']),
    ).toEqual({ 'origin/main': 'a', HEAD: 'c' })
  })

  it('prunes NOTHING on an empty ref list — that means git failed, not that every branch is gone', () => {
    const kept = { 'origin/main': 'a', 'origin/feat/x': 'b' }
    expect(pruneNotifiedRefs(kept, [])).toEqual(kept)
    expect(pruneNotifiedRefs(kept, undefined)).toEqual(kept)
    // …and a ref list that IS readable prunes as normal, while an unreadable
    // state degrades to empty instead of throwing.
    expect(
      pruneNotifiedRefs(
        {
          get 'origin/main'() {
            throw new Error('unreadable')
          },
        },
        ['origin/main'],
      ),
    ).toEqual({})
  })
})

describe('pruneFamine', () => {
  it('forgets a waiver clock no sweep ever refreshed', () => {
    // A workflow whose ref was deleted before it recovered would otherwise keep
    // its clock forever, and the next genuine famine would inherit it as
    // already expired — the false-alarm direction.
    expect(pruneFamine({ CI: t(60), Gone: NOW - FAMINE_TTL_MS - 1 }, NOW)).toEqual({ CI: t(60) })
    expect(pruneFamine(null, NOW)).toEqual({})
  })
})

describe('cachedAnswer', () => {
  it('never re-asks about a CONCLUDED answer', () => {
    expect(cachedAnswer({ state: 'success', checkedAt: 0 }, NOW)).toBe('success')
    expect(cachedAnswer({ state: 'nocheck', checkedAt: 0 }, NOW)).toBe('nocheck')
  })

  it('re-asks about a red or an unfinished run once the recheck window passes', () => {
    expect(cachedAnswer({ state: 'failed', checkedAt: NOW - 1 }, NOW)).toBe('failed')
    expect(cachedAnswer({ state: 'pending', checkedAt: NOW - 1 }, NOW)).toBe('pending')
    // A re-run turns a red green, and a running run finishes — neither is final.
    expect(cachedAnswer({ state: 'failed', checkedAt: NOW - RECHECK_MS - 1 }, NOW)).toBe(null)
    expect(cachedAnswer({ state: 'pending', checkedAt: NOW - RECHECK_MS - 1 }, NOW)).toBe(null)
  })

  it('fails open on junk', () => {
    expect(cachedAnswer(undefined, NOW)).toBe(null)
    expect(cachedAnswer({ state: 'seen', checkedAt: NOW }, NOW)).toBe(null)
  })
})

describe('renewable durable CI wait', () => {
  const observation = (at, state = 'pending') => ({
    target: { ref: 'origin/feat/x', sha: BRANCH },
    classification: { state, workflowName: 'CI', runId: 32462093487 },
    firstSeenAt: at,
    observedAt: at,
  })

  it('carries the complete identity and renews without replacing its wake token or deadline', () => {
    const firstObservation = { ...observation(t(120)), observedAt: t(90) }
    const secondObservation = { ...observation(t(120)), observedAt: t(30) }
    const first = renewCiWait(null, firstObservation, { now: t(90), makeWakeToken: () => 'wake-1' })
    const second = renewCiWait(first, secondObservation, { now: t(30), makeWakeToken: () => 'wake-2' })
    expect(ciWaitIdentity(observation(t(120)))).toBe(`origin/feat/x:${BRANCH}:CI:32462093487`)
    expect(second).toMatchObject({
      state: 'pending',
      ref: 'origin/feat/x',
      sha: BRANCH,
      workflow: 'CI',
      runId: 32462093487,
      firstObservationAt: t(90),
      lastObservationAt: t(30),
      deadline: t(120) + WAIT_BUDGET_MS,
      wakeToken: 'wake-1',
      observations: 2,
      terminal: null,
    })
  })

  it('gives a newly dispatched attempt a fresh deadline without replacing its observer', () => {
    const original = renewCiWait(null, {
      ...observation(NOW - WAIT_BUDGET_MS - 1),
      classification: { ...observation(NOW).classification, runAttempt: 1 },
      observedAt: NOW - WAIT_BUDGET_MS,
    }, { now: NOW - WAIT_BUDGET_MS, makeWakeToken: () => 'wake-original' })
    const observing = { ...original, observer: { pid: 123, startedAt: NOW - WAIT_BUDGET_MS } }
    const rerunObservedAt = NOW + 1
    const rerun = renewCiWait(observing, {
      ...observation(NOW - WAIT_BUDGET_MS - 1),
      classification: {
        ...observation(NOW).classification,
        runAttempt: 2,
        rerunKey: '32462093487:1',
      },
      observedAt: rerunObservedAt,
    }, { now: rerunObservedAt, makeWakeToken: () => 'must-not-replace' })

    expect(rerun).toMatchObject({
      runAttempt: 2,
      rerunKey: '32462093487:1',
      budgetStartedAt: rerunObservedAt,
      deadline: rerunObservedAt + WAIT_BUDGET_MS,
      wakeToken: 'wake-original',
      observer: observing.observer,
    })
  })

  it('keeps observing past the interaction deadline and preserves a terminal result for recovery', () => {
    const wait = renewCiWait(null, observation(NOW - WAIT_BUDGET_MS), { now: NOW, makeWakeToken: () => 'wake-1' })
    const stillPending = observeCiWait(wait, { state: 'pending' }, { now: NOW + 1 })
    const finished = observeCiWait(stillPending, { state: 'success', conclusion: 'success', url: 'https://x' }, { now: NOW + 2 })
    expect(stillPending).toMatchObject({ state: 'pending', deadline: NOW, lastObservationAt: NOW + 1 })
    expect(finished).toMatchObject({
      state: 'success',
      wakeToken: 'wake-1',
      observer: null,
      terminal: { state: 'success', verdict: 'green', observedAt: NOW + 2, conclusion: 'success', url: 'https://x' },
    })
  })

  it('hands a failing ci/gate status on as a RED CI-terminal handoff, never green', () => {
    const wait = renewCiWait(null, observation(NOW), { now: NOW, makeWakeToken: () => 'wake-1' })
    const soft = [run({ databaseId: 32462093487, headSha: BRANCH, headBranch: 'feat/x', url: 'https://github.com/o/r/actions/runs/32462093487' })]
    const statuses = [{ context: GATE_STATUS_CONTEXT, state: 'failure', target_url: 'https://github.com/o/r/actions/runs/32462093487' }]
    const terminal = observeCiWait(wait, classifyRuns(soft, BRANCH, { statuses, branch: refBranch(wait.ref) }), { now: NOW + 1 })
    const prompt = ciTerminalPrompt(assessCiWait({ wait: terminal, now: NOW + 2 }))
    expect(terminal.terminal).toMatchObject({ state: 'failed', verdict: 'red' })
    expect(prompt).toMatch(/concluded RED/)
    expect(prompt).not.toMatch(/GREEN/)
  })

  it('backs off exponentially but never reaches the 900-second scheduler interval', () => {
    expect(ciWaitBackoffMs({ observations: 1 })).toBe(15_000)
    expect(ciWaitBackoffMs({ observations: 2 })).toBe(30_000)
    expect(ciWaitBackoffMs({ observations: 20 })).toBe(90_000)
  })

  it('fails closed as data: malformed input cannot invent a wait or erase a valid one', () => {
    expect(renewCiWait(null, {}, { makeWakeToken: () => 'wake' })).toBeNull()
    const wait = renewCiWait(null, observation(NOW), { now: NOW, makeWakeToken: () => 'wake' })
    expect(observeCiWait(wait, { state: 'mystery' }, { now: NOW + 1 })).toEqual(wait)
  })

  it('never lets a stale pending observation resurrect an already-terminal wait', () => {
    const pending = renewCiWait(null, observation(NOW), { now: NOW, makeWakeToken: () => 'wake' })
    const terminal = observeCiWait(pending, { state: 'success' }, { now: NOW + 1 })
    const reconciled = reconcileCiWait(terminal, [observation(NOW)], { now: NOW + 2, makeWakeToken: () => 'new-wake' })
    expect(reconciled).toEqual(terminal)
  })

  it('archives terminal evidence only for the matching successor wake token', () => {
    const pending = renewCiWait(null, observation(NOW), { now: NOW, makeWakeToken: () => 'wake' })
    const terminal = observeCiWait(pending, { state: 'failed', conclusion: 'failure' }, { now: NOW + 1 })
    const original = { shas: {}, ciWait: terminal }
    expect(acknowledgeCiWaitState(original, 'stale', { now: NOW + 2 })).toEqual({ state: original, acknowledged: false })
    expect(acknowledgeCiWaitState(original, 'wake', { now: NOW + 2 })).toMatchObject({
      acknowledged: true,
      state: { ciWait: null, lastCiWait: { wakeToken: 'wake', recoveredAt: NOW + 2, terminal: { verdict: 'red' } } },
    })
  })

  it('FAKE CLOCK: two Stop attempts and worker exit keep the wait visible, then terminal wakes before 900 seconds', () => {
    let clock = NOW
    const stop = () => observation(clock)
    const first = renewCiWait(null, stop(), { now: clock, makeWakeToken: () => 'wake-incident' })

    clock += 60_000 // the second Stop attempt from the measured interaction
    const second = renewCiWait(first, stop(), { now: clock, makeWakeToken: () => 'must-not-replace' })
    expect(second).toMatchObject({ state: 'pending', wakeToken: 'wake-incident', observations: 2 })

    clock += 1 // worker exits; neither its pid nor its turn owns the observation
    const afterExit = assessCiWait({ wait: second, now: clock, probePid: () => null })
    expect(afterExit).toMatchObject({ visible: true, pending: true, repair: true })

    const workerExitedAt = clock
    clock += ciWaitBackoffMs(second)
    const terminalWait = observeCiWait(second, { state: 'success', conclusion: 'success' }, { now: clock })
    const terminal = assessCiWait({ wait: terminalWait, now: clock, probePid: () => null })
    const wake = successorStartDecision({
      trigger: {
        kind: SUCCESSOR_TRIGGERS.CI_TERMINAL,
        terminal: true,
        wakeToken: terminal.wakeToken,
        result: terminal.result,
      },
      spawnToken: 'successor-token',
      ciWait: terminal,
      openPoints: 1,
      assessment: { alive: false, reason: 'worker-exited' },
      now: clock,
    })
    expect(wake).toMatchObject({ start: true, code: 'start', reservation: { wakeToken: 'wake-incident' } })
    expect(clock - workerExitedAt).toBeLessThan(900_000)
  })
})

describe('refVerdict', () => {
  it('an unfinished run is a WAIT, not a pass — until the wait budget runs out', () => {
    expect(refVerdict({ state: 'pending', at: t(60), now: NOW })).toBe('wait')
    expect(refVerdict({ state: 'pending', at: NOW - WAIT_BUDGET_MS - 1, now: NOW })).toBe('gave-up')
  })

  it('no run yet passes inside the grace and is written off after it', () => {
    expect(refVerdict({ state: 'none', at: t(5), now: NOW })).toBe('pass')
    expect(refVerdict({ state: 'none', at: NOW - RUN_GRACE_MS - 1, now: NOW })).toBe('nocheck')
  })

  it('names the two conclusive verdicts', () => {
    expect(refVerdict({ state: 'failed', at: t(60), now: NOW })).toBe('red')
    expect(refVerdict({ state: 'success', at: t(60), now: NOW })).toBe('green')
  })
})

describe('pruneShaCache', () => {
  it('forgets what can no longer be a target', () => {
    expect(
      pruneShaCache({ keep: { state: 'success', firstSeenAt: t(60) }, drop: { state: 'success', firstSeenAt: NOW - PUSH_WINDOW_MS - 1 } }, NOW),
    ).toEqual({ keep: { state: 'success', firstSeenAt: t(60) } })
    expect(pruneShaCache(null, NOW)).toEqual({})
  })
})

// The sweep itself: all I/O injected, so what is asked, what is cached, what
// blocks and what alerts is decided here and pinned without a network.
async function sweep({ targets, runsBySha = {}, standDown = false, rerunWait = null, ...rest }) {
  const asked = []
  const alerts = []
  const result = await sweepTargets({
    targets,
    now: NOW,
    ...rest,
    fetchRuns: async (sha) => {
      asked.push(sha)
      return Object.prototype.hasOwnProperty.call(runsBySha, sha) ? runsBySha[sha] : null
    },
    judgeRed: async ({ classification }) => ({
      classification: { ...classification, cause: 'repository', detail: 'the failing job is "gate"', actionable: !standDown },
      standDown,
      rerunWait,
      stillFamished: standDown ? { CI: NOW } : {},
      judgedWorkflows: ['CI'],
    }),
    notify: async (a) => alerts.push(a),
  })
  return { ...result, asked, alerts }
}

const redRun = (sha) => [run({ headSha: sha, conclusion: 'failure', databaseId: 42 })]
const greenRun = (sha) => [run({ headSha: sha })]
const pendingRun = (sha) => [run({ headSha: sha, status: 'in_progress', conclusion: null })]

describe('sweepTargets', () => {
  const headTarget = { ref: 'origin/main', sha: HEAD, at: t(120) }
  const branchTarget = { ref: 'origin/feat/x', sha: BRANCH, at: t(120) }

  it('BLOCKS on a red pushed ref while HEAD is green, and NAMES that ref', async () => {
    // Exactly the night of 30.07.2026: main green, the delegated agent's branch
    // red, and the session that could have fixed it never learned.
    const got = await sweep({
      targets: [headTarget, branchTarget],
      runsBySha: { [HEAD]: greenRun(HEAD), [BRANCH]: redRun(BRANCH) },
    })
    expect(got.decision).toContain('origin/feat/x')
    expect(got.decision).toContain('RED')
    expect(got.decision).toContain(BRANCH.slice(0, 7))
    expect(got.alerts).toHaveLength(1)
    expect(got.alerts[0].target.ref).toBe('origin/feat/x')
  })

  it('reports a live author red without blocking, then reuses that verdict to gate after handoff', async () => {
    const reportTarget = { ...branchTarget, disposition: 'report' }
    const first = await sweep({ targets: [reportTarget], runsBySha: { [BRANCH]: redRun(BRANCH) } })
    expect(first.decision).toBe(null)
    expect(first.alerts).toEqual([])

    const afterHandoff = await sweepTargets({
      targets: [{ ...branchTarget, disposition: 'gate' }],
      cache: first.cache,
      notified: first.notified,
      now: NOW,
      fetchRuns: async () => {
        throw new Error('the fresh terminal verdict should be reused')
      },
      judgeRed: async () => {
        throw new Error('the fresh terminal verdict should be reused')
      },
      notify: async () => {},
    })
    expect(afterHandoff.decision).toContain('origin/feat/x')
    expect(afterHandoff.decision).toContain('RED')
  })

  it('alerts ONCE per (ref, sha) — the next turn on the same pair stays silent', async () => {
    const first = await sweep({ targets: [branchTarget], runsBySha: { [BRANCH]: redRun(BRANCH) } })
    expect(first.alerts).toHaveLength(1)
    const second = await sweepTargets({
      targets: [branchTarget],
      cache: {}, // cache expired → GitHub IS asked again, and it is still red
      notified: first.notified,
      now: NOW + RECHECK_MS + 1,
      fetchRuns: async () => redRun(BRANCH),
      judgeRed: async ({ classification }) => ({
        classification: { ...classification, cause: 'repository', actionable: true },
        standDown: false,
        stillFamished: {},
      }),
      notify: async () => {
        throw new Error('alerted twice for the same (ref, sha)')
      },
    })
    expect(second.decision).toContain('origin/feat/x') // still blocking…
  })

  it('asks GitHub NOTHING when nothing is pushed, and nothing when every answer is green', async () => {
    const none = await sweep({ targets: [] })
    expect(none.asked).toEqual([])
    expect(none.decision).toBe(null)

    const first = await sweep({ targets: [headTarget], runsBySha: { [HEAD]: greenRun(HEAD) } })
    expect(first.asked).toEqual([HEAD])
    expect(first.decision).toBe(null)
    // The common turn: same sha, a day later — a concluded green is never re-asked.
    const again = await sweep({ targets: [headTarget], cache: first.cache, runsBySha: { [HEAD]: greenRun(HEAD) } })
    expect(again.asked).toEqual([])
    expect(again.decision).toBe(null)
  })

  it('WAITS on an unfinished run instead of passing it', async () => {
    const got = await sweep({ targets: [branchTarget], runsBySha: { [BRANCH]: pendingRun(BRANCH) } })
    expect(got.decision).toContain('NOT yet concluded')
    expect(got.decision).toContain('origin/feat/x')
    expect(got.failedOpen).toEqual([])
    expect(got.observations).toEqual([
      expect.objectContaining({
        target: branchTarget,
        classification: expect.objectContaining({ state: 'pending' }),
        firstSeenAt: branchTarget.at,
        observedAt: NOW,
        verdict: 'wait',
      }),
    ])
    // …and the wait is re-read from the cache without a second API call.
    const again = await sweep({ targets: [branchTarget], cache: got.cache, runsBySha: { [BRANCH]: pendingRun(BRANCH) } })
    expect(again.asked).toEqual([])
    expect(again.decision).toContain('NOT yet concluded')
    expect(again.observations).toEqual([
      expect.objectContaining({ previousState: 'pending', verdict: 'wait' }),
    ])
  })

  it('WAITS on the dispatched failed-jobs re-run instead of caching the transient red', async () => {
    const rerunWait = {
      state: 'pending',
      runId: 42,
      runAttempt: 2,
      workflowName: 'Deploy to GitHub Pages',
      rerunKey: '42:1',
    }
    const got = await sweep({
      targets: [headTarget],
      runsBySha: { [HEAD]: redRun(HEAD) },
      standDown: true,
      rerunWait,
    })
    expect(got.decision).toContain('NOT yet concluded')
    expect(got.cache[HEAD]).toMatchObject({ state: 'pending', runId: 42 })
    expect(got.observations).toEqual([
      expect.objectContaining({ classification: rerunWait, verdict: 'wait' }),
    ])
  })

  it('gives a dispatched re-run a NEW wait budget even when the sha push is old', async () => {
    const oldTarget = { ...headTarget, at: NOW - WAIT_BUDGET_MS - 1 }
    const rerunWait = {
      state: 'pending',
      runId: 42,
      runAttempt: 2,
      workflowName: 'Deploy to GitHub Pages',
      rerunKey: '42:1',
    }
    const dispatched = await sweep({
      targets: [oldTarget],
      runsBySha: { [HEAD]: redRun(HEAD) },
      standDown: true,
      rerunWait,
    })
    expect(dispatched.cache[HEAD]).toMatchObject({
      state: 'pending',
      firstSeenAt: NOW,
      budgetStartedAt: NOW,
    })

    // Recheck after the API cache expires: target.at is still the old push
    // time, but the just-dispatched attempt has nearly its whole budget left.
    const nextSweep = await sweepTargets({
      targets: [oldTarget],
      cache: dispatched.cache,
      now: NOW + RECHECK_MS + 1,
      fetchRuns: async () => pendingRun(HEAD),
      judgeRed: async () => {
        throw new Error('an unfinished re-run is not red')
      },
      notify: async () => {},
    })
    expect(nextSweep.decision).toContain('NOT yet concluded')
    expect(nextSweep.failedOpen).toEqual([])
    expect(nextSweep.cache[HEAD]).toMatchObject({ budgetStartedAt: NOW })
  })

  it('the wait has a CEILING — past it the guard fails open, says so, and KEEPS asking', async () => {
    const stalled = { ...branchTarget, at: NOW - WAIT_BUDGET_MS - 1 }
    const got = await sweep({ targets: [stalled], runsBySha: { [BRANCH]: pendingRun(BRANCH) } })
    expect(got.decision).toBe(null)
    expect(got.failedOpen.join(' ')).toContain('never concluded')
    // Not written off as final: the run that concludes an hour later is still
    // judged, and its red still blocks.
    const later = await sweepTargets({
      targets: [stalled],
      cache: got.cache,
      now: NOW + RECHECK_MS + 1,
      fetchRuns: async () => redRun(BRANCH),
      judgeRed: async ({ classification }) => ({
        classification: { ...classification, cause: 'repository', actionable: true },
        standDown: false,
        stillFamished: {},
        judgedWorkflows: ['CI'],
      }),
      notify: async () => {},
    })
    expect(later.decision).toContain('origin/feat/x')
  })

  it('writes a commit no workflow covers off PER SHA — never per ref', async () => {
    // The blocking four-eyes finding: a per-ref write-off would silently pass
    // the next commit's red. A `[skip ci]` RESCUE push is exactly that shape —
    // GitHub creates no run for it, and the very next commit on that branch is
    // the one that finishes the work and runs CI for real.
    const rescue = { ref: 'origin/feat/x', sha: 'rescue0', at: NOW - RUN_GRACE_MS - 1 }
    const got = await sweep({ targets: [rescue], runsBySha: { rescue0: [] } })
    expect(got.decision).toBe(null)
    expect(got.cache.rescue0.state).toBe('nocheck')
    // …and the finishing commit on the SAME ref is still asked about, and its
    // red still blocks.
    const next = await sweep({
      targets: [{ ...rescue, sha: BRANCH, at: NOW }],
      cache: got.cache,
      runsBySha: { [BRANCH]: redRun(BRANCH) },
    })
    expect(next.asked).toEqual([BRANCH])
    expect(next.decision).toContain('origin/feat/x')
  })

  it('does not write a ref off while the run may still appear', async () => {
    const got = await sweep({ targets: [{ ref: 'origin/feat/x', sha: BRANCH, at: t(5) }], runsBySha: { [BRANCH]: [] } })
    expect(got.decision).toBe(null)
    // Nothing conclusive cached, so the run that appears a second later IS judged.
    expect(cachedAnswer(got.cache[BRANCH], NOW)).toBe(null)
  })

  it('fails OPEN with a stated reason when GitHub cannot be read', async () => {
    const got = await sweep({ targets: [branchTarget], runsBySha: {} })
    expect(got.decision).toBe(null)
    expect(got.failedOpen.join(' ')).toContain('could not be read')
    expect(got.failedOpen.join(' ')).toContain('origin/feat/x')
  })

  it('a red GitHub itself caused alerts but does not hold the turn (point 528)', async () => {
    const got = await sweep({ targets: [branchTarget], runsBySha: { [BRANCH]: redRun(BRANCH) }, standDown: true })
    expect(got.decision).toBe(null)
    expect(got.alerts).toHaveLength(1)
    expect(got.famine.CI).toBe(NOW)
  })

  it('a green run clears the outage waiver of its workflow', async () => {
    const got = await sweep({ targets: [headTarget], famine: { CI: t(9999) }, runsBySha: { [HEAD]: greenRun(HEAD) } })
    expect(got.famine).toEqual({})
  })

  it('a CACHED wait stops blocking the moment the ceiling passes, not a minute later', async () => {
    // Recorded with ten seconds of budget left, so the entry is a real wait…
    const nearlyDone = { ...branchTarget, at: NOW - WAIT_BUDGET_MS + 10_000 }
    const got = await sweep({ targets: [nearlyDone], runsBySha: { [BRANCH]: pendingRun(BRANCH) } })
    expect(got.decision).toContain('NOT yet concluded')
    // …and half a minute later the cache is still fresh (no API call) but the
    // budget has passed: the mute may outlive the wait, the BLOCK may not.
    const later = await sweep({
      targets: [nearlyDone],
      cache: got.cache,
      now: NOW + 30_000,
      runsBySha: { [BRANCH]: pendingRun(BRANCH) },
    })
    expect(later.asked).toEqual([])
    expect(later.decision).toBe(null)
  })

  it('the waiver clock does not depend on which red target ran first', async () => {
    // Two refs, both red on the same workflow, one judged an outage and one
    // ours. Whichever order the sweep walks them in, the outage clock survives.
    const runsBySha = { [HEAD]: redRun(HEAD), [BRANCH]: redRun(BRANCH) }
    const judgeRed = async ({ sha, classification }) =>
      sha === HEAD
        ? {
            classification: { ...classification, cause: 'external', actionable: false },
            standDown: true,
            stillFamished: { CI: t(9999) },
            judgedWorkflows: ['CI'],
          }
        : {
            classification: { ...classification, cause: 'repository', actionable: true },
            standDown: false,
            stillFamished: {},
            judgedWorkflows: ['CI'],
          }
    for (const targets of [
      [headTarget, branchTarget],
      [branchTarget, headTarget],
    ]) {
      const got = await sweepTargets({
        targets,
        now: NOW,
        fetchRuns: async (sha) => runsBySha[sha],
        judgeRed,
        notify: async () => {},
      })
      expect(got.famine).toEqual({ CI: t(9999) })
      expect(got.decision).toContain('origin/feat/x')
    }
  })

  it('a red that IS ours clears the waiver clock too, instead of leaving it stale', async () => {
    // A clock left behind makes the NEXT genuine famine read as an
    // already-expired waiver and escalate at once — the false-alarm direction.
    const got = await sweep({ targets: [branchTarget], famine: { CI: t(9999) }, runsBySha: { [BRANCH]: redRun(BRANCH) } })
    expect(got.famine).toEqual({})
    expect(got.decision).toContain('origin/feat/x')
  })
})

describe('ciRedAlertMessage', () => {
  it('carries the deadline of a non-blocking external red into the alert', () => {
    const message = ciRedAlertMessage({
      target: { ref: 'origin/main', sha: HEAD },
      standDown: true,
      classification: {
        workflowName: 'Deploy to GitHub Pages',
        runId: 32054043421,
        conclusion: 'failure',
        cause: 'external',
        alertDetail: true,
        detail: 'the Pages queue is empty',
        remedy: 'outage deadline: 2026-08-18T02:03:00.000Z',
      },
    })
    expect(message).toContain('nothing in the repository can clear it')
    expect(message).toContain('the Pages queue is empty')
    expect(message).toContain('2026-08-18T02:03:00.000Z')
  })
})

// A parked point's red that its OPEN TASKS.md entry charges is reported, not
// blocked (15.10.2026, run 38591097319); main is never exempt.
describe('charged reds', () => {
  const RUN = '38591097319'
  const tasks = [
    '- [ ] 1342. Natural villager motion b',
    `  Charged: run ${RUN} on feat/1342-natural-motion-b is this point's own unfinished state.`,
    '- [ ] 1343. Another point',
    '  Mentions run 99999999999 only here.',
    '- [x] 1344. Closed point',
    '  run 77777777777',
  ].join('\n')
  const red = (sha) => [run({ headSha: sha, conclusion: 'failure', databaseId: Number(RUN) })]
  const featTarget = { ref: 'origin/feat/1342-natural-motion-b', sha: BRANCH, at: t(120) }
  const fromTasks = (text) => (branch) => chargedRunIds(text, branch)

  it('chargedRunIds reads only the owning OPEN point block', () => {
    expect([...chargedRunIds(tasks, 'feat/1342-natural-motion-b')]).toEqual([RUN])
    expect([...chargedRunIds(tasks, 'feat/1343-x')]).toEqual(['99999999999'])
    expect(chargedRunIds(tasks, 'feat/1344-x').size).toBe(0) // closed point
    expect(chargedRunIds(tasks, 'feat/1345-x').size).toBe(0) // no such point
    expect(chargedRunIds(tasks, 'main').size).toBe(0)
    expect(chargedRunIds(tasks, 'HEAD').size).toBe(0)
    expect(chargedRunIds(null, 'feat/1342-x').size).toBe(0)
  })

  it('a charged red on a feature ref reports without blocking', async () => {
    const got = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: red(BRANCH) }, chargedRuns: fromTasks(tasks) })
    expect(got.decision).toBe(null)
    expect(got.charged).toEqual([{ ref: featTarget.ref, sha: BRANCH, runId: RUN }])
    expect(got.cache[BRANCH]).toMatchObject({ state: 'failed', runId: Number(RUN) })
    expect(got.alerts).toHaveLength(1) // notification unchanged
  })

  it('the same red without the note still blocks', async () => {
    const got = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: red(BRANCH) }, chargedRuns: fromTasks('- [ ] 1342. x') })
    expect(got.decision).toContain(featTarget.ref)
    expect(got.charged).toEqual([])
    const noSource = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: red(BRANCH) } })
    expect(noSource.decision).toContain('RED')
  })

  it('a red run on another point charged elsewhere does not exempt this branch', async () => {
    const other = { ...featTarget, ref: 'origin/feat/1343-x' }
    const got = await sweep({ targets: [other], runsBySha: { [BRANCH]: red(BRANCH) }, chargedRuns: fromTasks(tasks) })
    expect(got.decision).toContain('RED')
  })

  it('main is never exempt, even when the source names the run', async () => {
    const mainTarget = { ref: 'origin/main', sha: HEAD, at: t(120) }
    const got = await sweep({ targets: [mainTarget], runsBySha: { [HEAD]: red(HEAD) }, chargedRuns: () => new Set([RUN]) })
    expect(got.decision).toContain('origin/main')
    expect(got.charged).toEqual([])
  })

  it('the cached failed path honours the charge, and blocks without it', async () => {
    const first = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: red(BRANCH) } })
    expect(first.decision).toContain('RED')
    const again = await sweep({ targets: [featTarget], cache: first.cache, chargedRuns: fromTasks(tasks) })
    expect(again.asked).toEqual([])
    expect(again.decision).toBe(null)
    expect(again.charged).toEqual([{ ref: featTarget.ref, sha: BRANCH, runId: RUN }])
    const uncharged = await sweep({ targets: [featTarget], cache: first.cache, chargedRuns: fromTasks('') })
    expect(uncharged.decision).toContain('RED')
  })

  // Review 15.10.2026, P1: a charge on one red must not exempt another red on
  // the same sha, whichever of the two the API lists first.
  const OTHER = '38591097320'
  const mixed = (order) => {
    const a = run({ headSha: BRANCH, conclusion: 'failure', databaseId: Number(RUN), workflowName: 'CI' })
    const b = run({ headSha: BRANCH, conclusion: 'failure', databaseId: Number(OTHER), workflowName: 'Pages' })
    return order === 'charged-first' ? [a, b] : [b, a]
  }
  for (const order of ['charged-first', 'uncharged-first']) {
    it(`a charged and an uncharged red on one sha still block (${order})`, async () => {
      const got = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: mixed(order) }, chargedRuns: fromTasks(tasks) })
      expect(got.decision).toContain('RED')
      expect(got.charged).toEqual([])
      expect([...got.cache[BRANCH].runIds].sort()).toEqual([RUN, OTHER])
      const again = await sweep({ targets: [featTarget], cache: got.cache, chargedRuns: fromTasks(tasks) })
      expect(again.decision).toContain('RED')
    })
  }

  it('two reds on one sha exempt only when both are charged', async () => {
    const both = `${tasks}\n- [ ] 1399. y`.replace(`run ${RUN} on`, `run ${RUN} and run ${OTHER} on`)
    const got = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: mixed('uncharged-first') }, chargedRuns: fromTasks(both) })
    expect(got.decision).toBe(null)
    expect(got.charged).toHaveLength(1)
  })

  it('a judge naming its blocking reds narrows the set to them', async () => {
    const got = await sweepTargets({
      targets: [featTarget], now: NOW,
      fetchRuns: async () => mixed('uncharged-first'),
      // The uncharged red is GitHub's side (unactionable), so only the charged one blocks.
      judgeRed: async ({ classification }) => ({ classification: { ...classification, runId: Number(RUN) }, standDown: false, blockingRunIds: [RUN] }),
      notify: async () => {},
      chargedRuns: fromTasks(tasks),
    })
    expect(got.decision).toBe(null)
    expect(got.charged).toEqual([{ ref: featTarget.ref, sha: BRANCH, runId: RUN }])
  })

  // Review 15.10.2026, P3: the durable observer's terminal entry keeps its run
  // ids, so a charged red it finished does not block until the cache expires.
  it('an observer-written failed entry honours the charge', async () => {
    const wait = { ref: featTarget.ref, sha: BRANCH, firstObservationAt: t(300) }
    const classification = { state: 'failed', runId: Number(RUN), workflowName: 'CI', conclusion: 'failure' }
    const entry = observedShaEntry({ wait, classification, reason: blockReason(classification, BRANCH, wait.ref), runIds: [RUN], runs: red(BRANCH), observedAt: t(10) })
    expect(entry).toMatchObject({ state: 'failed', runId: Number(RUN), runIds: [RUN], branch: 'feat/1342-natural-motion-b', settled: true })
    const got = await sweep({ targets: [featTarget], cache: { [BRANCH]: entry }, chargedRuns: fromTasks(tasks) })
    expect(got.asked).toEqual([])
    expect(got.decision).toBe(null)
    expect(got.charged).toEqual([{ ref: featTarget.ref, sha: BRANCH, runId: RUN }])
    const uncharged = await sweep({ targets: [featTarget], cache: { [BRANCH]: entry }, chargedRuns: fromTasks('') })
    expect(uncharged.decision).toContain('RED')
    expect(observedShaEntry({ wait, classification: { state: 'success' }, observedAt: t(10) })).not.toHaveProperty('runIds')
  })

  // Second review 15.10.2026, P1: a cached failed entry exempts only for the
  // branch that produced it; a sibling feat branch on the same sha does not.
  it('a cached charge from another branch, or from no branch, does not exempt', async () => {
    const sibling = { ...featTarget, ref: 'origin/feat/1343-x' }
    const first = await sweep({ targets: [sibling], runsBySha: { [BRANCH]: red(BRANCH) } })
    expect(first.cache[BRANCH]).toMatchObject({ state: 'failed', branch: 'feat/1343-x', runIds: [RUN] })
    const cross = await sweep({ targets: [featTarget], cache: first.cache, chargedRuns: fromTasks(tasks) })
    expect(cross.asked).toEqual([])
    expect(cross.decision).toContain('RED')
    const { branch: _dropped, ...noBranch } = first.cache[BRANCH]
    const bare = await sweep({ targets: [featTarget], cache: { [BRANCH]: noBranch }, chargedRuns: fromTasks(tasks) })
    expect(bare.decision).toContain('RED')
    const own = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: red(BRANCH) } })
    expect(own.cache[BRANCH].branch).toBe('feat/1342-natural-motion-b')
    const cachedOwn = await sweep({ targets: [featTarget], cache: own.cache, chargedRuns: fromTasks(tasks) })
    expect(cachedOwn.decision).toBe(null)
  })

  // Second review 15.10.2026, P2: an actionable red without a run id can never
  // be charged, so it keeps the sha blocking next to a charged one.
  it('an id-less blocking red prevents the exemption', async () => {
    const got = await sweepTargets({
      targets: [featTarget], now: NOW,
      fetchRuns: async () => red(BRANCH),
      judgeRed: async ({ classification }) => ({ classification, standDown: false, blockingRunIds: [RUN, null] }),
      notify: async () => {},
      chargedRuns: fromTasks(tasks),
    })
    expect(got.decision).toContain('RED')
    expect(got.cache[BRANCH].runIds).toEqual([RUN, null])
    const again = await sweep({ targets: [featTarget], cache: got.cache, chargedRuns: fromTasks(tasks) })
    expect(again.decision).toContain('RED')
    const idless = run({ headSha: BRANCH, conclusion: 'failure', databaseId: undefined, workflowName: 'Pages' })
    const ids = blockingRunIds({ runs: [...red(BRANCH), idless], sha: BRANCH, branch: 'feat/1342-natural-motion-b' })
    expect(ids).toContain(null)
    const wait = { ref: featTarget.ref, sha: BRANCH, firstObservationAt: t(300) }
    const observed = observedShaEntry({ wait, classification: { state: 'failed', runId: Number(RUN) }, reason: 'RED', runIds: ids, observedAt: t(10) })
    expect(observed.runIds).toContain(null)
    const fromObserver = await sweep({ targets: [featTarget], cache: { [BRANCH]: observed }, chargedRuns: fromTasks(tasks) })
    expect(fromObserver.decision).toBe('RED')
  })

  // Third review 15.10.2026: a charged red does not release the turn while
  // another workflow on the sha is still running.
  for (const order of ['red-first', 'running-first']) {
    it(`a charged red beside a running workflow waits instead of exempting (${order})`, async () => {
      const running = run({ headSha: BRANCH, status: 'in_progress', conclusion: null, databaseId: 5, workflowName: 'Pages' })
      const runs = order === 'red-first' ? [...red(BRANCH), running] : [running, ...red(BRANCH)]
      const got = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: runs }, chargedRuns: fromTasks(tasks) })
      expect(got.decision).toContain('NOT yet concluded')
      expect(got.charged).toEqual([])
      expect(got.cache[BRANCH]).toMatchObject({ state: 'pending', runId: 5, workflowName: 'Pages' })
      expect(got.observations.at(-1)).toMatchObject({ verdict: 'wait', classification: { state: 'pending', runId: 5 } })
    })
  }

  // Review 15.10.2026, P2: past the budget the sibling wait still reaches the
  // durable wait through reconciliation instead of reading as a red.
  it('a charged red beside a running workflow past the budget keeps a durable pending wait', async () => {
    const running = run({ headSha: BRANCH, status: 'in_progress', conclusion: null, databaseId: 5, workflowName: 'Pages' })
    const stale = { ...featTarget, at: NOW - WAIT_BUDGET_MS - 1000 }
    const got = await sweep({ targets: [stale], runsBySha: { [BRANCH]: [...red(BRANCH), running] }, chargedRuns: fromTasks(tasks) })
    expect(got.decision).toBe(null)
    expect(got.failedOpen).toHaveLength(1)
    expect(got.cache[BRANCH]).toMatchObject({ state: 'pending' })
    expect(got.observations.at(-1)).toMatchObject({ verdict: 'gave-up', classification: { state: 'pending', runId: 5 } })
    const wait = reconcileCiWait(null, got.observations, { now: NOW, makeWakeToken: () => 'tok' })
    expect(wait).toMatchObject({ state: 'pending', runId: 5, wakeToken: 'tok' })
  })

  it('a charged red whose sibling workflows all finished is exempt', async () => {
    const done = run({ headSha: BRANCH, conclusion: 'success', databaseId: 5, workflowName: 'Pages' })
    const got = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: [...red(BRANCH), done] }, chargedRuns: fromTasks(tasks) })
    expect(got.decision).toBe(null)
    expect(got.charged).toEqual([{ ref: featTarget.ref, sha: BRANCH, runId: RUN }])
    expect(got.cache[BRANCH].state).toBe('failed')
  })

  it('an uncharged red beside a running workflow still blocks', async () => {
    const running = run({ headSha: BRANCH, status: 'queued', conclusion: null, databaseId: 5, workflowName: 'Pages' })
    const got = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: [...red(BRANCH), running] }, chargedRuns: fromTasks('') })
    expect(got.decision).toContain('RED')
  })

  // Fourth review 15.10.2026, P1: a red cached beside a running workflow keeps
  // that fact; charged later, it is asked again instead of exempted from cache.
  it('a red cached beside a running workflow is rechecked, not exempted, once charged', async () => {
    const running = run({ headSha: BRANCH, status: 'in_progress', conclusion: null, databaseId: 5, workflowName: 'Pages' })
    const first = await sweep({ targets: [featTarget], runsBySha: { [BRANCH]: [...red(BRANCH), running] }, chargedRuns: fromTasks('') })
    expect(first.decision).toContain('RED')
    expect(first.cache[BRANCH]).toMatchObject({ state: 'failed', settled: false })
    const still = await sweep({ targets: [featTarget], cache: first.cache, runsBySha: { [BRANCH]: [...red(BRANCH), running] }, chargedRuns: fromTasks(tasks) })
    expect(still.asked).toEqual([BRANCH])
    expect(still.decision).toContain('NOT yet concluded')
    expect(still.charged).toEqual([])
    const done = { ...running, status: 'completed', conclusion: 'success' }
    const finished = await sweep({ targets: [featTarget], cache: first.cache, runsBySha: { [BRANCH]: [...red(BRANCH), done] }, chargedRuns: fromTasks(tasks) })
    expect(finished.decision).toBe(null)
    expect(finished.cache[BRANCH]).toMatchObject({ state: 'failed', settled: true })
  })

  it('a report-only red cached beside a running workflow is rechecked once it gates', async () => {
    const running = run({ headSha: BRANCH, status: 'queued', conclusion: null, databaseId: 5, workflowName: 'Pages' })
    const runsBySha = { [BRANCH]: [...red(BRANCH), running] }
    const report = await sweep({ targets: [{ ...featTarget, disposition: 'report' }], runsBySha, chargedRuns: fromTasks(tasks) })
    expect(report.decision).toBe(null)
    expect(report.cache[BRANCH].settled).toBe(false)
    const gating = await sweep({ targets: [featTarget], cache: report.cache, runsBySha, chargedRuns: fromTasks(tasks) })
    expect(gating.asked).toEqual([BRANCH])
    expect(gating.decision).toContain('NOT yet concluded')
  })

  it('an observer entry without runs, or with a running sibling, is not settled', () => {
    const wait = { ref: featTarget.ref, sha: BRANCH, firstObservationAt: t(300) }
    const classification = { state: 'failed', runId: Number(RUN) }
    const running = run({ headSha: BRANCH, status: 'in_progress', conclusion: null, databaseId: 5, workflowName: 'Pages' })
    expect(observedShaEntry({ wait, classification, runIds: [RUN], observedAt: t(10) }).settled).toBe(false)
    expect(observedShaEntry({ wait, classification, runIds: [RUN], runs: [...red(BRANCH), running], observedAt: t(10) }).settled).toBe(false)
  })

  // Fourth review 15.10.2026, P2: the observer renews its wait on the running
  // sibling instead of finishing on the charged red or polling unrecorded.
  it('the observer classifies a charged red beside a running workflow as that pending wait', () => {
    const branch = 'feat/1342-natural-motion-b'
    const running = run({ headSha: BRANCH, status: 'in_progress', conclusion: null, databaseId: 5, workflowName: 'Pages' })
    const runs = [...red(BRANCH), running]
    const got = observerClassification(runs, BRANCH, { branch, chargedRuns: fromTasks(tasks) })
    expect(got).toMatchObject({ state: 'pending', runId: 5, workflowName: 'Pages' })
    expect(observerClassification(runs, BRANCH, { branch, chargedRuns: fromTasks('') }).state).toBe('failed')
    const done = [...red(BRANCH), { ...running, status: 'completed', conclusion: 'success' }]
    expect(observerClassification(done, BRANCH, { branch, chargedRuns: fromTasks(tasks) })).toMatchObject({ state: 'failed', runId: Number(RUN) })
    expect(observerClassification(runs, BRANCH, { branch: 'main', chargedRuns: () => new Set([RUN]) }).state).toBe('failed')

    // The same pending classification goes through the ordinary renewal.
    const target = { ref: featTarget.ref, sha: BRANCH }
    const observe = (at) => ({ target, classification: got, firstSeenAt: t(300), observedAt: at })
    const opened = renewCiWait(null, observe(t(60)), { now: t(60), makeWakeToken: () => 'tok' })
    const renewed = renewCiWait(opened, observe(t(10)), { now: t(10), makeWakeToken: () => 'other' })
    expect(renewed).toMatchObject({ state: 'pending', wakeToken: 'tok', lastObservationAt: t(10), runId: 5 })
    expect(renewed.firstObservationAt).toBe(opened.firstObservationAt)
  })

  // Review 15.10.2026, P2: reported once per session, again in a new one.
  it('a charged red is reported once per session and again in a new session', () => {
    const c = [{ ref: featTarget.ref, sha: BRANCH, runId: RUN }]
    const first = chargedReportsDue(undefined, 's1', c)
    expect(first.due).toEqual(c)
    const repeat = chargedReportsDue(first.next, 's1', c)
    expect(repeat.due).toEqual([])
    expect(chargedReportsDue(repeat.next, 's1', c).due).toEqual([])
    const fresh = chargedReportsDue(repeat.next, 's2', c)
    expect(fresh.due).toEqual(c)
    expect(fresh.next).toEqual({ session: 's2', keys: [`${featTarget.ref}@${BRANCH}`] })
  })
})
