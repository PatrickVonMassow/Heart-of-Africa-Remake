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
const writeState = (state) => writeFileSync(statePath(), JSON.stringify(state, null, 2))
const completeState = (commit) => ({ commit, steps: Object.fromEntries(CLOSING_STEPS.map((s) => [s.id, { evidence: `did ${s.id}` }])) })

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
  })
})
