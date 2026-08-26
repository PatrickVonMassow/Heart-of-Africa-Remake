// THE CLOSING GATE, PROVEN BY RUNNING IT.
//
// The decision sweep lives in closing-guard-core.test.mjs. This suite spawns the
// real wrapper the way the harness spawns it — `node scripts/closing-guard.mjs`
// with the PreToolUse JSON on stdin — inside an ISOLATED temp repo with its own
// git history, because only a spawn proves the executed path: the stdin
// contract, which tool names are guarded at all, that HEAD really comes from
// git (a state recorded for another commit must not open the gate), that the
// work order is read for a tick, and that every failure lands OPEN.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { CLOSING_STEPS } from './closing-guard-core.mjs'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
let repo
let head

const git = (args) => spawnSync('git', args, { windowsHide: true, cwd: repo, encoding: 'utf8' })
const statePath = () => resolve(repo, '.claude', 'closing-state.json')
const writeState = (state) => {
  mkdirSync(resolve(repo, '.claude'), { recursive: true }) // a `git clean` in a test may have taken the untracked dir with it
  writeFileSync(statePath(), JSON.stringify(state, null, 2))
}
// A COMPLETE closing is also an ORDERED one (point 631): every cleanup step is
// dated, and the second regression names the commit being closed and a time
// after them.
const completeState = (commit) => ({
  commit,
  steps: Object.fromEntries(
    CLOSING_STEPS.map((s) => [
      s.id,
      s.id === 'regression-after-cleanup'
        ? { evidence: `LARGE green on ${commit}, both backends, 2026-08-11T12:00:00Z`, at: '2026-08-11T12:05:00.000Z' }
        : { evidence: `did ${s.id}`, at: '2026-08-11T10:00:00.000Z' },
    ]),
  ),
})

/** The work order the tick tests act on: one closing point, one ordinary point. */
const TASKS = [
  '# Work order',
  '',
  '- [ ] 224. DEMO CHECKPOINT — full closing run → publish the checkpoint as `v0.2`.',
  '',
  '- [ ] 331. CLOSING-GUARD HARDENING — fix the option-swallowing quantifier.',
  '',
].join('\n')

/** Run the guard with a PreToolUse payload; returns { status, stdout, decision }. */
function callGuard(toolName, toolInput = {}) {
  const r = spawnSync(process.execPath, [resolve(repo, 'scripts', 'closing-guard.mjs')], {
    windowsHide: true,
    cwd: repo,
    encoding: 'utf8',
    input: JSON.stringify({ session_id: 'closing-guard-test', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput }),
  })
  let decision = null
  try {
    decision = r.stdout.trim() ? JSON.parse(r.stdout.trim()) : null
  } catch {
    /* not a decision payload — the assertions report the raw stdout instead */
  }
  return { ...r, decision }
}

const reasonOf = (r) => (r.decision && r.decision.hookSpecificOutput && r.decision.hookSpecificOutput.permissionDecisionReason) || ''

beforeAll(() => {
  repo = mkdtempSync(resolve(tmpdir(), 'hoa-closing-guard-'))
  cpSync(SOURCE_SCRIPTS, resolve(repo, 'scripts'), { recursive: true, filter: (src) => !/[\\/](verify|git-hooks)([\\/]|$)/.test(src) })
  mkdirSync(resolve(repo, '.claude'), { recursive: true })
  mkdirSync(resolve(repo, 'docs'), { recursive: true })
  writeFileSync(resolve(repo, 'TASKS.md'), TASKS)
  writeFileSync(resolve(repo, 'docs', 'tasks-archive.md'), '# Archive\n')
  git(['init', '-q'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'Test'])
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'fixture'])
  head = git(['rev-parse', 'HEAD']).stdout.trim()
  expect(head).toMatch(/^[0-9a-f]{40}$/)
})

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true })
})

beforeEach(() => {
  writeState({ commit: head, steps: { 'large-regression': { evidence: 'ran it' } } }) // an INCOMPLETE closing
})

describe('closing-guard (spawned)', () => {
  it('uses the fixture cwd even when the executable script lives in the source checkout', () => {
    const r = spawnSync(process.execPath, [resolve(SOURCE_SCRIPTS, 'closing-guard.mjs'), '--status'], {
      windowsHide: true,
      cwd: repo,
      encoding: 'utf8',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain(`HEAD ${head.slice(0, 12)}`)
  })

  it('denies a version tag on an incomplete closing, with a well-formed deny payload', () => {
    const r = callGuard('Bash', { command: 'git tag -a v0.3 -m "demo"' })
    expect(r.status, r.stderr).toBe(0)
    expect(r.decision, `printed ${JSON.stringify(r.stdout)}`).toBeTruthy()
    const out = r.decision.hookSpecificOutput
    expect(out.hookEventName).toBe('PreToolUse')
    expect(out.permissionDecision).toBe('deny')
    expect(out.permissionDecisionReason).toContain('CLOSING INCOMPLETE')
    expect(out.permissionDecisionReason).toContain('dead-code')
  })

  it('denies the same act through the PowerShell tool — the primary shell on the host', () => {
    const r = callGuard('PowerShell', { command: 'git push origin poc --force' })
    expect(r.status, r.stderr).toBe(0)
    expect(r.decision, `printed ${JSON.stringify(r.stdout)}`).toBeTruthy()
    expect(r.decision.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(reasonOf(r)).toContain('CLOSING INCOMPLETE')
    // and it is the SAME gate: complete the closing and PowerShell passes too
    writeState(completeState(head))
    expect(callGuard('PowerShell', { command: 'git push origin poc --force' }).stdout.trim()).toBe('')
  })

  it('denies the TICK of a closing point — the claim that the closing is done', () => {
    const r = callGuard('Edit', { file_path: resolve(repo, 'docs', 'tasks-archive.md'), old_string: '# Archive', new_string: '# Archive\n- [x] 224. DEMO CHECKPOINT' })
    expect(r.status, r.stderr).toBe(0)
    expect(r.decision, `printed ${JSON.stringify(r.stdout)}`).toBeTruthy()
    expect(reasonOf(r)).toContain('point 224')
  })

  it('allows the tick of a point that does not deliver a closing, and every ordinary call', () => {
    for (const call of [
      ['Edit', { file_path: resolve(repo, 'docs', 'tasks-archive.md'), new_string: '- [x] 331. CLOSING-GUARD HARDENING' }],
      ['Edit', { file_path: resolve(repo, 'TASKS.md'), new_string: '- [ ] 500. a new point' }],
      ['Write', { file_path: resolve(repo, 'src', 'App.tsx'), content: '- [x] 224. quoted in code' }],
      ['Bash', { command: 'git push origin main' }],
      ['Bash', { command: 'npm run test:unit' }],
      ['Read', { file_path: resolve(repo, 'TASKS.md') }],
    ]) {
      const r = callGuard(call[0], call[1])
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout.trim(), `${call[0]} ${JSON.stringify(call[1])} must be allowed`).toBe('')
    }
  })

  it('allows both acts once every step is recorded FOR THE REAL HEAD, and blocks for another commit', () => {
    writeState(completeState(head))
    expect(callGuard('Bash', { command: 'git tag -a v0.3 -m x' }).stdout.trim()).toBe('')
    expect(callGuard('Edit', { file_path: resolve(repo, 'TASKS.md'), old_string: '- [ ] 224.', new_string: '- [x] 224.' }).stdout.trim()).toBe('')

    writeState(completeState('0000000000000000000000000000000000000000'))
    expect(reasonOf(callGuard('Bash', { command: 'git tag -a v0.3 -m x' }))).toContain('CLOSING INCOMPLETE')
    expect(reasonOf(callGuard('Edit', { file_path: resolve(repo, 'TASKS.md'), old_string: '- [ ] 224.', new_string: '- [x] 224.' }))).toContain('point 224')
  })

  it('fails OPEN on an unparseable state file, on no stdin and on junk stdin', () => {
    writeFileSync(statePath(), '{ this is not json')
    // an unreadable state records nothing done, so the TAG still blocks (safe
    // direction) — what must never happen is a crash or a non-zero exit
    const broken = callGuard('Bash', { command: 'git tag v0.3' })
    expect(broken.status, broken.stderr).toBe(0)

    const guard = resolve(repo, 'scripts', 'closing-guard.mjs')
    for (const input of ['', 'not json', '{"tool_name":"Bash"}']) {
      const r = spawnSync(process.execPath, [guard], { windowsHide: true, cwd: repo, encoding: 'utf8', input })
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout.trim()).toBe('')
    }
  })

  it('keeps the tag shut when the second regression predates the cleanup, and opens it when it does not', () => {
    // The order check runs in the SPAWNED guard, on the state file it reads
    // itself and against the REAL head of this repository — the sequence point
    // 631 anchors, proven end to end.
    const stale = completeState(head)
    stale.steps['regression-after-cleanup'] = { evidence: `LARGE green on ${head}, 2026-08-11T09:00:00Z`, at: '2026-08-11T09:05:00.000Z' }
    writeState(stale)
    const reason = reasonOf(callGuard('Bash', { command: 'git tag -a v0.3 -m x' }))
    expect(reason).toContain('regression-after-cleanup')
    expect(reason).toContain('RECORDED BUT OUT OF ORDER')

    // a run on SOME OTHER commit is no proof either, however recent
    const foreign = completeState(head)
    foreign.steps['regression-after-cleanup'] = { evidence: 'LARGE green on 1234abc, both backends, 2026-08-11T12:00:00Z', at: '2026-08-11T12:05:00.000Z' }
    writeState(foreign)
    expect(reasonOf(callGuard('Bash', { command: 'git tag -a v0.3 -m x' }))).toContain('NOT the commit being closed')

    writeState(completeState(head))
    expect(callGuard('Bash', { command: 'git tag -a v0.3 -m x' }).stdout.trim()).toBe('')
  })

  it('never crashes on a structurally hostile state file, and keeps denying the tag', () => {
    // Types nobody writes on purpose: a step that is a string, an `at` that is a
    // number, a steps table that is an array. None of them may cost a non-zero
    // exit or a denied ordinary call — a guard's own bug may never stop work.
    writeState({ commit: head, steps: { 'regression-after-cleanup': 'not an object', 'dead-code': { evidence: 1, at: {} } } })
    for (const call of [
      ['Bash', { command: 'git push origin main' }],
      ['Edit', { file_path: resolve(repo, 'TASKS.md'), new_string: '- [ ] 500. a new point' }],
    ]) {
      const r = callGuard(call[0], call[1])
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout.trim()).toBe('')
    }
    writeState({ commit: head, steps: [] })
    const tag = callGuard('Bash', { command: 'git tag v0.3' })
    expect(tag.status, tag.stderr).toBe(0) // nothing recorded → still denies the TAG, but never crashes
    expect(reasonOf(tag)).toContain('CLOSING INCOMPLETE')
  })

  it('walks the real closing flow: record, cleanup commit, re-record, tag', () => {
    // The reasoning the gate rests on, exercised instead of asserted: the state
    // is per-commit, so a cleanup COMMIT invalidates what was recorded before
    // it, and the tag opens only once the steps are re-recorded — in order —
    // against the commit that will actually be tagged.
    const run = (...args) => spawnSync(process.execPath, [resolve(repo, 'scripts', 'closing-guard.mjs'), ...args], { windowsHide: true, cwd: repo, encoding: 'utf8' })
    try {
      run('--reset')
      run('--step', 'large-regression', '--evidence', `LARGE green on ${head}, both backends, run 1`)
      expect(run('--status').stdout).toContain('[x] large-regression')

      // the cleanup lands as a commit — HEAD moves and the closing starts over
      writeFileSync(resolve(repo, 'docs', 'swept.md'), '# swept\n')
      git(['add', '-A'])
      git(['commit', '-q', '-m', 'cleanup'])
      const head2 = git(['rev-parse', 'HEAD']).stdout.trim()
      expect(head2).not.toBe(head)
      expect(run('--status').stdout).toContain(`0/${CLOSING_STEPS.length} done`)
      expect(reasonOf(callGuard('Bash', { command: 'git tag -a v0.3 -m x' }))).toContain('CLOSING INCOMPLETE')

      // re-record every step at the new HEAD, in the order they happened
      for (const step of CLOSING_STEPS) {
        const evidence = step.id === 'regression-after-cleanup' ? `LARGE green on ${head2}, both backends, run 2` : `did ${step.id}`
        const r = run('--step', step.id, '--evidence', evidence)
        expect(r.stdout, `${step.id}: ${r.stdout}`).not.toContain('does NOT count')
      }
      expect(run('--status').stdout).toContain('ALL closing steps recorded')
      expect(callGuard('Bash', { command: 'git tag -a v0.3 -m x' }).stdout.trim()).toBe('')

      // and naming the OLD commit — the state before the cleanup — shuts it again
      const stale = run('--step', 'regression-after-cleanup', '--evidence', `LARGE green on ${head}, both backends`)
      expect(stale.stdout).toContain('does NOT count')
      expect(reasonOf(callGuard('Bash', { command: 'git tag -a v0.3 -m x' }))).toContain('NOT the commit being closed')
    } finally {
      git(['reset', '--hard', head])
      git(['clean', '-fd'])
    }
  })

  it('drives the checklist from the CLI: --status, --step and --reset', () => {
    const run = (...args) => spawnSync(process.execPath, [resolve(repo, 'scripts', 'closing-guard.mjs'), ...args], { windowsHide: true, cwd: repo, encoding: 'utf8' })
    writeState({ commit: head, steps: {} })
    expect(run('--status').stdout).toContain(`0/${CLOSING_STEPS.length} done`)
    expect(run('--step', 'bogus-step', '--evidence', 'x').status).toBe(1)
    expect(run('--step', 'dead-code').status).toBe(1) // evidence is required
    expect(run('--step', 'dead-code', '--evidence', 'swept the scripts').stdout).toContain(`1/${CLOSING_STEPS.length}`)
    expect(run('--status').stdout).toContain('[x] dead-code')
    expect(run('--reset').status).toBe(0)
    expect(run('--status').stdout).toContain(`0/${CLOSING_STEPS.length} done`)

    // The second regression is recorded like any step, but an evidence that
    // pins it to nothing does not count — and says so at the moment of writing.
    expect(run('--step', 'regression-after-cleanup', '--evidence', 'ran it again').stdout).toContain('does NOT count')
    expect(run('--status').stdout).toContain('names neither the commit being closed')
    // the record time the CLI stamps is what the order is judged by, so a run
    // named by the real head counts as soon as it is written
    expect(run('--step', 'regression-after-cleanup', '--evidence', `LARGE green on ${head}, both backends`).stdout).toContain(`1/${CLOSING_STEPS.length}`)
    expect(run('--status').stdout).toContain('[x] regression-after-cleanup')
  })
})
