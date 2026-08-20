// The landing chain's decisions (point 594).
//
// This is a MEDIUM-criticality mechanism: it bundles steps several guards govern,
// and a swallowed intermediate error would advance state nobody verified. So the
// cases here are weighted towards the FAILURE paths — the transition that must
// not be written, the step that must not report green, the skip that must not
// happen — rather than towards the happy chain, which is the cheap half.
import { describe, it, expect } from 'vitest'
import { evaluateTasksArchive } from './tasks-archive-guard-core.mjs'
import { evaluateCommitTrailers, POLICY_NEUTRAL } from './model-guard-core.mjs'
import { openFingerprintOfTasks } from './board-currency-core.mjs'
import {
  AUDIT_TRIGGER_FILES,
  GATE_COMMANDS,
  LANDING_STEPS,
  LandingError,
  MERGE_ARGS,
  SERIALISING_STRAYS,
  STEP_IDS,
  VERDICT,
  auditNeeded,
  boardPublishNeeded,
  foldResult,
  formatLandingVerdict,
  gateConcurrency,
  landingExit,
  markNotReached,
  planLanding,
  resolveBranch,
  runSteps,
  stepLabel,
  tickAndArchive,
  tickCommitMessage,
  transitionAccepted,
} from './land-point-core.mjs'

// ---------------------------------------------------------------------------
describe('the chain itself', () => {
  it('runs the seven steps in the order the guards need', () => {
    // The gate is AFTER the merge (two points that auto-merge cleanly can still
    // break together) and the cleanup is LAST (a branch deleted before the tick
    // is one nobody can go back to when the tick fails).
    expect(STEP_IDS).toEqual(['merge', 'gate', 'tick', 'archive', 'push', 'board', 'cleanup'])
    expect(STEP_IDS.indexOf('gate')).toBeGreaterThan(STEP_IDS.indexOf('merge'))
    expect(STEP_IDS.indexOf('cleanup')).toBe(STEP_IDS.length - 1)
  })

  it('makes the work DURABLE before it deletes anything', () => {
    // THE HALF STATE THAT LOSES WORK. Between the merge and the push, the merge
    // commit exists only in local main and the tick only as an uncommitted file
    // edit. Deleting the remote branch in that window removes the last remote
    // copy of the work, batch-boundary cannot see a tick that is not in
    // `git log main -- TASKS.md docs/tasks-archive.md`, and a stray
    // `git checkout TASKS.md` erases it. So: push before cleanup, always.
    expect(STEP_IDS.indexOf('push')).toBeGreaterThan(STEP_IDS.indexOf('tick'))
    expect(STEP_IDS.indexOf('push')).toBeGreaterThan(STEP_IDS.indexOf('archive'))
    expect(STEP_IDS.indexOf('push')).toBeLessThan(STEP_IDS.indexOf('cleanup'))
  })

  it('never fast-forwards', () => {
    // `git log --first-parent main` is the only calendar measurement this project
    // has; a fast-forwarded point vanishes from it and from the CI ref accounting.
    expect(MERGE_ARGS).toContain('--no-ff')
    expect(MERGE_ARGS).not.toContain('--ff-only')
  })

  it('gives every step a label, and every label a step', () => {
    for (const s of LANDING_STEPS) expect(stepLabel(s.id)).toBe(s.label)
    expect(stepLabel('nonesuch')).toBe('nonesuch')
  })
})

// ---------------------------------------------------------------------------
describe('the tick commit message', () => {
  it('carries a co-author trailer naming the model it was given', () => {
    const msg = tickCommitMessage({ number: 594, model: 'Claude Opus 5' })
    expect(msg).toMatch(/^Co-Authored-By: Claude Opus 5 <noreply@anthropic\.com>$/m)
    expect(evaluateCommitTrailers(msg).block).toBe(false)
  })

  it('REFUSES to invent a model when none is given', () => {
    // The trailer is model-guard's only machine-readable evidence of who authored
    // a commit. A script that filled in a plausible name would defeat exactly the
    // tripwire that caught three defective deliveries on 24.07.2026.
    for (const model of [undefined, null, '', '   ']) {
      expect(() => tickCommitMessage({ number: 594, model })).toThrow(LandingError)
      expect(() => tickCommitMessage({ number: 594, model })).toThrow(/no authoring model/)
    }
  })

  it('produces a message the model gate REJECTS for a forbidden model', () => {
    // The wrapper checks this before the merge, so a wrong --model costs nothing.
    expect(evaluateCommitTrailers(tickCommitMessage({ number: 1, model: 'Claude Haiku 4.5' })).block).toBe(true)
    expect(evaluateCommitTrailers(tickCommitMessage({ number: 1, model: 'Claude Sonnet 5' })).block).toBe(true)
  })

  it('accepts every model the policy allows', () => {
    for (const m of ['Claude Opus 5', 'Claude Fable 5', 'Claude Opus 4.8']) {
      expect(evaluateCommitTrailers(tickCommitMessage({ number: 1, model: m }), POLICY_NEUTRAL).block).toBe(false)
    }
  })

  it('names no point number in the subject, per the commit convention', () => {
    const subject = tickCommitMessage({ number: 594, model: 'Claude Opus 5' }).split('\n')[0]
    expect(subject).not.toMatch(/594|\bPoint\b/)
  })
})

describe('resolveBranch', () => {
  const branches = ['main', 'feat/59-old', 'feat/594-landing-command', 'feat/5940-nope']

  it('finds the branch for a point', () => {
    expect(resolveBranch({ branches, number: 594 })).toBe('feat/594-landing-command')
  })

  it('does not confuse a prefix for the number', () => {
    // feat/59-old and feat/5940-nope both start with digits that CONTAIN 59/594.
    expect(resolveBranch({ branches, number: 59 })).toBe('feat/59-old')
  })

  it('refuses rather than guesses when two branches match', () => {
    const dup = ['feat/594-a', 'feat/594-b']
    expect(() => resolveBranch({ branches: dup, number: 594 })).toThrow(LandingError)
    expect(() => resolveBranch({ branches: dup, number: 594 })).toThrow(/2 branches match/)
  })

  it('refuses when nothing matches', () => {
    expect(() => resolveBranch({ branches: ['main'], number: 594 })).toThrow(/nothing to land/)
  })
})

// ---------------------------------------------------------------------------
describe('rider (a) — the audit runs on a lockfile change', () => {
  it('runs when the lockfile moved', () => {
    const v = auditNeeded({ changedFiles: ['src/App.tsx', 'package-lock.json'] })
    expect(v.run).toBe(true)
    expect(v.reason).toMatch(/dependency tree moved/)
  })

  it('runs when the manifest moved', () => {
    expect(auditNeeded({ changedFiles: ['package.json'] }).run).toBe(true)
  })

  it('skips when only source and docs moved', () => {
    const v = auditNeeded({ changedFiles: ['src/App.tsx', 'CLAUDE.md', 'scripts/x.mjs'] })
    expect(v.run).toBe(false)
    expect(v.reason).toMatch(/no lockfile change/)
  })

  it('is not fooled by a lookalike path', () => {
    // `docs/package-lock.json.md` and `my-package.json.bak` are not the lockfile.
    expect(auditNeeded({ changedFiles: ['docs/package-lock.json.md'] }).run).toBe(false)
    expect(auditNeeded({ changedFiles: ['tools/my-package.json.bak'] }).run).toBe(false)
  })

  it('matches the lockfile in a subdirectory', () => {
    expect(auditNeeded({ changedFiles: ['sub/package-lock.json'] }).run).toBe(true)
  })

  it('handles backslash paths and empty input', () => {
    expect(auditNeeded({ changedFiles: ['sub\\package-lock.json'] }).run).toBe(true)
    expect(auditNeeded({}).run).toBe(false)
    expect(auditNeeded({ changedFiles: null }).run).toBe(false)
  })

  it('names exactly the two files that can move the verdict', () => {
    expect([...AUDIT_TRIGGER_FILES].sort()).toEqual(['package-lock.json', 'package.json'])
  })
})

// ---------------------------------------------------------------------------
describe('rider (b) — an unchanged board is not republished', () => {
  const hash = 'abc123'
  const fp = 'sha256:deadbeef'
  const clean = { pagesPublishedHash: hash, publishedFingerprint: fp }

  it('skips when content AND the open-point set are unchanged', () => {
    const v = boardPublishNeeded({ fileHash: hash, fingerprint: fp, state: clean })
    expect(v.run).toBe(false)
    expect(v.reason).toMatch(/unchanged/)
  })

  it('publishes when the content changed', () => {
    expect(boardPublishNeeded({ fileHash: 'other', fingerprint: fp, state: clean }).run).toBe(true)
  })

  it('publishes when the open-point set moved under identical bytes', () => {
    // THE SUBTLE ONE: a tick changes the open-point set without necessarily
    // changing a rendered card, and board-first-guard reads publishDue off that
    // fingerprint. Skipping here would arm a guard that blocks the next turn.
    const v = boardPublishNeeded({ fileHash: hash, fingerprint: 'sha256:new', state: clean })
    expect(v.run).toBe(true)
    expect(v.reason).toMatch(/open-point set changed/)
  })

  it('publishes when the last publish failed', () => {
    const v = boardPublishNeeded({ fileHash: hash, fingerprint: fp, state: { ...clean, publishFailed: { at: 1 } } })
    expect(v.run).toBe(true)
    expect(v.reason).toMatch(/failed/)
  })

  it('publishes when a publish is already due', () => {
    const v = boardPublishNeeded({ fileHash: hash, fingerprint: fp, state: { ...clean, publishDue: { at: 1 } } })
    expect(v.run).toBe(true)
  })

  it('publishes when the live page has no recorded fingerprint', () => {
    const v = boardPublishNeeded({ fileHash: hash, fingerprint: fp, state: { pagesPublishedHash: hash } })
    expect(v.run).toBe(true)
    expect(v.reason).toMatch(/was ever recorded/)
  })

  it('publishes rather than assumes when the file could not be hashed', () => {
    expect(boardPublishNeeded({ fileHash: null, fingerprint: fp, state: clean }).run).toBe(true)
  })

  it('publishes on an empty state', () => {
    expect(boardPublishNeeded({ fileHash: hash, fingerprint: fp, state: {} }).run).toBe(true)
    expect(boardPublishNeeded({}).run).toBe(true)
  })

  // THE COMPOSITION, not the function. The decision was once taken against the
  // PRE-tick work order, and every landing moves the open-point set by
  // definition — so the skip fired exactly when it must not, the live page went
  // stale, publishDue armed and board-first-guard denied the next turn. The
  // function was never wrong; its input was. These two cases pin the input.
  it('SKIPS on the pre-tick work order and PUBLISHES on the post-tick one', () => {
    const { tasks: afterTick } = tickAndArchive({ tasksText: TASKS, archiveText: ARCHIVE, number: 594 })
    const before = openFingerprintOfTasks(TASKS)
    const after = openFingerprintOfTasks(afterTick)
    expect(after).not.toBe(before)

    // The board bytes are unchanged, and the recorded state matches the PRE-tick
    // fingerprint — the exact steady state of a landing.
    const state = { pagesPublishedHash: hash, publishedFingerprint: before }
    expect(boardPublishNeeded({ fileHash: hash, fingerprint: before, state }).run).toBe(false)
    expect(boardPublishNeeded({ fileHash: hash, fingerprint: after, state }).run).toBe(true)
  })

  it('every ticked point moves the fingerprint, so no landing can ever skip on it', () => {
    for (const n of [592, 594, 595]) {
      const { tasks } = tickAndArchive({ tasksText: TASKS, archiveText: ARCHIVE, number: n })
      expect(openFingerprintOfTasks(tasks)).not.toBe(openFingerprintOfTasks(TASKS))
    }
  })
})

// ---------------------------------------------------------------------------
describe('rider (c) — the concurrency interlock', () => {
  const verify = { kind: 'verify-run', pid: 1 }
  const browser = { kind: 'automation-browser', pid: 2 }
  const devServer = { kind: 'dev-server', pid: 3 }

  it('goes parallel on a machine free of competing runs', () => {
    const v = gateConcurrency({ strays: [], probeOk: true })
    expect(v.mode).toBe('parallel')
  })

  it('goes SERIAL while a browser suite runs — the interlock', () => {
    for (const stray of [verify, browser]) {
      const v = gateConcurrency({ strays: [stray], probeOk: true })
      expect(v.mode).toBe('serial')
      expect(v.blockers).toHaveLength(1)
    }
  })

  it('goes serial beside another vitest run', () => {
    // Our own gate runs vitest; a second one on the box is what produced four
    // "Test timed out in 5000ms" failures in tests that pass in 582 ms alone.
    expect(gateConcurrency({ strays: [{ kind: 'unit-run' }], probeOk: true }).mode).toBe('serial')
  })

  it('does not serialise on a mere leftover dev server', () => {
    // A dev server is load the probe reports, not a run whose verdict we can spoil.
    expect(gateConcurrency({ strays: [devServer], probeOk: true }).mode).toBe('parallel')
  })

  it('falls back to serial when the machine could not be probed', () => {
    const v = gateConcurrency({ strays: [], probeOk: false })
    expect(v.mode).toBe('serial')
    expect(v.reason).toMatch(/safe side/)
  })

  it('honours a forced mode in both directions', () => {
    expect(gateConcurrency({ strays: [verify], probeOk: true, force: 'parallel' }).mode).toBe('parallel')
    expect(gateConcurrency({ strays: [], probeOk: true, force: 'serial' }).mode).toBe('serial')
  })

  it('survives junk strays', () => {
    expect(gateConcurrency({ strays: [null, {}, { kind: 42 }], probeOk: true }).mode).toBe('parallel')
    expect(gateConcurrency({ strays: 'nope', probeOk: true }).mode).toBe('parallel')
  })

  // THE OUTCOME, NOT THE DECISION. gateConcurrency choosing "parallel" and
  // reporting "parallel" proved nothing: the first runner wrapped a SYNCHRONOUS
  // execFileSync in a Promise executor, so both branches ran strictly one after
  // the other while every test passed. These cases ask whether the steps
  // actually overlap.
  describe('runSteps — does the work actually overlap?', () => {
    /** A runner that starts on call and only settles when released. */
    const deferredRunner = () => {
      const started = []
      const release = new Map()
      const run = (id) => {
        started.push(id)
        return new Promise((res) => release.set(id, () => res({ id, ok: true })))
      }
      return { run, started, release }
    }

    it('parallel: every step has STARTED before any of them settles', async () => {
      const { run, started, release } = deferredRunner()
      const all = runSteps({ ids: ['build', 'lint', 'unit'], mode: 'parallel', run })
      await Promise.resolve()
      expect(started).toEqual(['build', 'lint', 'unit'])
      for (const id of ['build', 'lint', 'unit']) release.get(id)()
      expect((await all).map((r) => r.id)).toEqual(['build', 'lint', 'unit'])
    })

    it('serial: a step does NOT start until the previous one has settled', async () => {
      const { run, started, release } = deferredRunner()
      const all = runSteps({ ids: ['build', 'lint', 'unit'], mode: 'serial', run })
      await Promise.resolve()
      expect(started).toEqual(['build'])
      release.get('build')()
      await Promise.resolve()
      await Promise.resolve()
      expect(started).toEqual(['build', 'lint'])
      release.get('lint')()
      await new Promise((r) => setTimeout(r, 0))
      release.get('unit')()
      expect((await all).map((r) => r.id)).toEqual(['build', 'lint', 'unit'])
    })

    it('parallel awaits ALL of them, so every red step is named at once', async () => {
      const run = async (id) => ({ id, ok: id === 'build' })
      const out = await runSteps({ ids: ['build', 'lint', 'unit'], mode: 'parallel', run })
      expect(out.filter((r) => !r.ok).map((r) => r.id)).toEqual(['lint', 'unit'])
    })

    it('refuses a missing runner rather than silently doing nothing', async () => {
      await expect(runSteps({ ids: ['build'], mode: 'parallel' })).rejects.toThrow(LandingError)
    })

    it('handles an empty step list in both modes', async () => {
      expect(await runSteps({ ids: [], mode: 'parallel', run: async () => ({}) })).toEqual([])
      expect(await runSteps({ ids: [], mode: 'serial', run: async () => ({}) })).toEqual([])
    })
  })

  it('names the interlocking kinds and the gate commands', () => {
    expect(SERIALISING_STRAYS).toContain('verify-run')
    expect(SERIALISING_STRAYS).toContain('automation-browser')
    expect(Object.keys(GATE_COMMANDS).sort()).toEqual(['audit', 'build', 'lint', 'unit'])
    expect(GATE_COMMANDS.audit).toEqual(['node', 'scripts/audit-check.mjs'])
  })
})

// ---------------------------------------------------------------------------
const TASKS = [
  '# TASKS',
  '',
  '## Checklist',
  '',
  '- [ ] 592. AN EARLIER POINT',
  '  body of 592.',
  '',
  '- [ ] 594. THE LANDING COMMAND (user 09.08.2026)',
  '  first body line.',
  '  second body line.',
  '',
  '- [ ] 595. A LATER POINT',
  '  body of 595.',
  '',
  '## Closing (only after all points)',
  '',
  '- something else',
  '',
].join('\n')

const ARCHIVE = ['# TASKS-Archiv', '', '- [x] 100. AN OLD POINT', '  old body.', ''].join('\n')

describe('the tick and the archive move', () => {
  it('moves the block verbatim, changing only the checkbox', () => {
    const { tasks, archive, block } = tickAndArchive({ tasksText: TASKS, archiveText: ARCHIVE, number: 594 })
    expect(block).toBe(
      ['- [x] 594. THE LANDING COMMAND (user 09.08.2026)', '  first body line.', '  second body line.'].join('\n'),
    )
    expect(archive).toContain(block)
    expect(tasks).not.toContain('594.')
  })

  it('leaves every other point untouched', () => {
    const { tasks } = tickAndArchive({ tasksText: TASKS, archiveText: ARCHIVE, number: 594 })
    expect(tasks).toContain('- [ ] 592. AN EARLIER POINT')
    expect(tasks).toContain('- [ ] 595. A LATER POINT')
    expect(tasks).toContain('## Closing (only after all points)')
  })

  it('stops the block at a section heading, not only at the next point', () => {
    const { tasks, block } = tickAndArchive({ tasksText: TASKS, archiveText: ARCHIVE, number: 595 })
    expect(block).toBe(['- [x] 595. A LATER POINT', '  body of 595.'].join('\n'))
    expect(tasks).toContain('## Closing (only after all points)')
    expect(tasks).toContain('- something else')
  })

  it('introduces no archive-guard finding', () => {
    // The real judge, not a restatement of it: the same core the Stop hook uses.
    // The toy fixture has gaps in its numbering, so the guard has findings BEFORE
    // the move as well — which is exactly why the chain compares the two.
    const { tasks, archive } = tickAndArchive({ tasksText: TASKS, archiveText: ARCHIVE, number: 594 })
    const v = transitionAccepted({
      before: evaluateTasksArchive({ tasksText: TASKS, archiveText: ARCHIVE }),
      after: evaluateTasksArchive({ tasksText: tasks, archiveText: archive }),
    })
    expect(v.ok).toBe(true)
    expect(v.findings).toEqual([])
  })

  it('appends exactly one blank line of separation, however the archive ended', () => {
    for (const tail of ['', '\n', '\n\n\n', '   \n\n']) {
      const { archive } = tickAndArchive({ tasksText: TASKS, archiveText: ARCHIVE + tail, number: 594 })
      expect(archive).toMatch(/old body\.\n\n- \[x\] 594\./)
      expect(archive.endsWith('second body line.\n')).toBe(true)
    }
  })

  it('refuses a point that is not in TASKS.md', () => {
    expect(() => tickAndArchive({ tasksText: TASKS, archiveText: ARCHIVE, number: 999 })).toThrow(/not in TASKS\.md/)
  })

  it('refuses a point already in the archive', () => {
    const archive = `${ARCHIVE}\n- [x] 594. ALREADY THERE\n`
    expect(() => tickAndArchive({ tasksText: TASKS, archiveText: archive, number: 594 })).toThrow(/already in/)
  })

  it('refuses a point that appears twice in TASKS.md', () => {
    const doubled = `${TASKS}\n- [ ] 594. A SECOND COPY\n  body.\n`
    expect(() => tickAndArchive({ tasksText: doubled, archiveText: ARCHIVE, number: 594 })).toThrow(/appears 2 times/)
  })

  it('refuses a point already ticked in place', () => {
    const ticked = TASKS.replace('- [ ] 594.', '- [x] 594.')
    expect(() => tickAndArchive({ tasksText: ticked, archiveText: ARCHIVE, number: 594 })).toThrow(/already ticked/)
  })

  it('refuses a non-number', () => {
    for (const n of [null, 'x', 0, -1, 1.5]) {
      expect(() => tickAndArchive({ tasksText: TASKS, archiveText: ARCHIVE, number: n })).toThrow(LandingError)
    }
  })

  it('carries a repair on every refusal', () => {
    try {
      tickAndArchive({ tasksText: TASKS, archiveText: ARCHIVE, number: 999 })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LandingError)
      expect(e.step).toBe('tick')
      expect(e.repair).toBeTruthy()
    }
  })

  it('handles the last point in the file (no following block)', () => {
    const last = ['# TASKS', '', '- [ ] 594. THE ONLY POINT', '  body.'].join('\n')
    const { tasks, block } = tickAndArchive({ tasksText: last, archiveText: ARCHIVE, number: 594 })
    expect(block).toBe('- [x] 594. THE ONLY POINT\n  body.')
    expect(tasks).toBe('# TASKS\n')
  })
})

describe('transitionAccepted', () => {
  const dup = { rule: 'duplicate-point', detail: 'both files', points: [594] }
  const gap = { rule: 'point-vanished', detail: 'unrelated', points: [300] }

  it('rejects a finding the transition INTRODUCES', () => {
    const v = transitionAccepted({ before: { block: false, findings: [] }, after: { block: true, findings: [dup] } })
    expect(v.ok).toBe(false)
    expect(v.findings).toEqual([dup])
  })

  it('does NOT block on a finding the work order already carried', () => {
    // Blocking on an unrelated pre-existing gap would stall every landing behind
    // a repair that has nothing to do with the point being landed.
    const v = transitionAccepted({ before: { block: true, findings: [gap] }, after: { block: true, findings: [gap] } })
    expect(v.ok).toBe(true)
    expect(v.preexisting).toEqual([gap])
  })

  it('separates the introduced finding from the pre-existing one', () => {
    const v = transitionAccepted({
      before: { block: true, findings: [gap] },
      after: { block: true, findings: [gap, dup] },
    })
    expect(v.ok).toBe(false)
    expect(v.findings).toEqual([dup])
    expect(v.preexisting).toEqual([gap])
  })

  it('tells two findings of the same rule apart by the points they name', () => {
    const other = { rule: 'point-vanished', detail: 'x', points: [999] }
    const v = transitionAccepted({
      before: { block: true, findings: [gap] },
      after: { block: true, findings: [gap, other] },
    })
    expect(v.ok).toBe(false)
    expect(v.findings).toEqual([other])
  })

  it('fails CLOSED on a missing verdict — never green by absence', () => {
    expect(transitionAccepted({}).ok).toBe(false)
    expect(transitionAccepted({ after: null }).ok).toBe(false)
    expect(transitionAccepted().ok).toBe(false)
  })

  it('still accepts the legacy single-verdict form', () => {
    expect(transitionAccepted({ verdict: { block: false, findings: [] } }).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('the plan', () => {
  const base = {
    number: 594,
    branch: 'feat/594-x',
    audit: { run: false, reason: 'no lockfile change' },
    gate: { mode: 'parallel', reason: 'quiet' },
    board: { run: true, reason: 'the board content changed' },
    worktrees: ['/repo/.claude/worktrees/a'],
  }

  it('plans every step, in order', () => {
    const plan = planLanding(base)
    expect(plan.steps.map((s) => s.id)).toEqual(STEP_IDS)
  })

  it('shows a skipped board publish as SKIP before anything runs', () => {
    const plan = planLanding({ ...base, board: { run: false, reason: 'unchanged' } })
    const board = plan.steps.find((s) => s.id === 'board')
    expect(board.run).toBe(false)
    expect(board.reason).toBe('unchanged')
  })

  it('names the gate mode and whether the audit joins it', () => {
    expect(planLanding(base).steps.find((s) => s.id === 'gate').reason).toMatch(/parallel/)
    const withAudit = planLanding({ ...base, audit: { run: true, reason: 'lock moved' } })
    expect(withAudit.steps.find((s) => s.id === 'gate').reason).toMatch(/\+ audit/)
  })

  it('counts the worktrees the cleanup will remove', () => {
    expect(planLanding(base).steps.find((s) => s.id === 'cleanup').reason).toMatch(/1 worktree/)
    expect(planLanding({ ...base, worktrees: [] }).steps.find((s) => s.id === 'cleanup').reason).toMatch(/no worktree/)
  })
})

// ---------------------------------------------------------------------------
describe('failing loud at the first red step', () => {
  it('continues while steps are ok or skipped', () => {
    let r = []
    for (const v of [VERDICT.ok, VERDICT.skipped, VERDICT.ok]) {
      const f = foldResult(r, { id: 'x', verdict: v })
      expect(f.continue).toBe(true)
      r = f.results
    }
  })

  it('stops on the first failure — structurally, not by convention', () => {
    expect(foldResult([], { id: 'gate', verdict: VERDICT.failed }).continue).toBe(false)
  })

  it('reports an unreached step as unreached, never as green and never as absent', () => {
    const plan = planLanding({
      number: 594,
      branch: 'b',
      audit: { run: false },
      gate: { mode: 'serial', reason: '' },
      board: { run: true },
      worktrees: [],
    })
    const results = markNotReached({
      plan,
      results: [
        { id: 'merge', verdict: VERDICT.ok },
        { id: 'gate', verdict: VERDICT.failed, detail: 'unit red' },
      ],
    })
    expect(results.map((r) => r.id)).toEqual(STEP_IDS)
    const rest = results.filter((r) => ['tick', 'archive', 'board', 'cleanup'].includes(r.id))
    expect(rest.every((r) => r.verdict === VERDICT.notReached)).toBe(true)
    expect(rest.some((r) => r.verdict === VERDICT.ok)).toBe(false)
  })

  it('exits non-zero on any failure and on an empty run', () => {
    expect(landingExit([{ verdict: VERDICT.ok }, { verdict: VERDICT.skipped }])).toBe(0)
    expect(landingExit([{ verdict: VERDICT.ok }, { verdict: VERDICT.failed }])).toBe(1)
    expect(landingExit([{ verdict: VERDICT.notReached }])).toBe(1)
    expect(landingExit([])).toBe(1)
    expect(landingExit()).toBe(1)
  })
})

// ---------------------------------------------------------------------------
describe('the one summary', () => {
  const green = STEP_IDS.map((id) => ({ id, verdict: id === 'board' ? VERDICT.skipped : VERDICT.ok, detail: '' }))

  it('says LANDED when every step is ok or skipped', () => {
    const text = formatLandingVerdict({ number: 594, branch: 'feat/594-x', results: green }).join('\n')
    expect(text).toMatch(/LANDED\./)
    expect(text).toContain('SKIP board')
  })

  it('names the failing step and states that nothing past it ran', () => {
    const results = markNotReached({
      plan: { steps: LANDING_STEPS },
      results: [
        { id: 'merge', verdict: VERDICT.ok },
        { id: 'gate', verdict: VERDICT.failed, detail: 'unit red' },
      ],
    })
    const text = formatLandingVerdict({
      number: 594,
      branch: 'feat/594-x',
      results,
      error: new LandingError('the fast gate is red', { step: 'gate', repair: 'fix unit, then re-run' }),
    }).join('\n')
    expect(text).toMatch(/LANDING FAILED at "gate"/)
    expect(text).toMatch(/no half state was left/)
    expect(text).toMatch(/repair: fix unit, then re-run/)
    expect(text).not.toMatch(/LANDED\./)
  })

  it('gives one line per step and nothing else per step', () => {
    const lines = formatLandingVerdict({ number: 594, branch: 'b', results: green })
    // header + one per step + the verdict line
    expect(lines).toHaveLength(green.length + 2)
  })

  it('never claims success on an empty result set', () => {
    const text = formatLandingVerdict({ number: 594, branch: 'b', results: [] }).join('\n')
    expect(text).toMatch(/INCOMPLETE/)
  })

  it('calls a run with an unreached step incomplete, not landed', () => {
    const partial = [
      { id: 'merge', verdict: VERDICT.ok },
      { id: 'gate', verdict: VERDICT.notReached },
    ]
    expect(formatLandingVerdict({ number: 594, branch: 'b', results: partial }).join('\n')).toMatch(/INCOMPLETE/)
  })
})
