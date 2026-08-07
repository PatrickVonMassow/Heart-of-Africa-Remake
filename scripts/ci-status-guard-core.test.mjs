// Vitest coverage for the pure CI-status decision logic (ci-status-guard-core.mjs):
// red blocks and notifies once per sha, pending/success/none allow, malformed
// input fails open, and a green re-run supersedes its red predecessor.
import { describe, it, expect } from 'vitest'
import {
  blockReason,
  cachedAnswer,
  classifyRuns,
  failedRuns,
  notifiedFromState,
  pruneFamine,
  pruneNotifiedRefs,
  pruneShaCache,
  pushedRefsFromReflog,
  recoveredWorkflows,
  refTargets,
  refVerdict,
  shouldBlock,
  shouldNotify,
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

  it('keeps the old guarantee: a HEAD pushed from another clone is still judged', () => {
    const got = refTargets({ pushed: [], existingRefs: [], headSha: HEAD, headPushed: true })
    expect(got).toEqual([{ ref: 'HEAD', sha: HEAD, at: 0 }])
    // …and nothing is claimed when HEAD was never pushed at all.
    expect(refTargets({ pushed: [], existingRefs: [], headSha: HEAD, headPushed: false })).toEqual([])
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
async function sweep({ targets, runsBySha = {}, standDown = false, ...rest }) {
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
    // …and the wait is re-read from the cache without a second API call.
    const again = await sweep({ targets: [branchTarget], cache: got.cache, runsBySha: { [BRANCH]: pendingRun(BRANCH) } })
    expect(again.asked).toEqual([])
    expect(again.decision).toContain('NOT yet concluded')
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
