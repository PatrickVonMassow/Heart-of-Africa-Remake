// The pre-push gate's decision (point 302). The rule it defends: CI must never
// be the first place a broken state is noticed, because a red run mails the
// user and a later fix does not unsend that mail.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  FULL_GATE,
  GATE_COMMANDS,
  LIGHT_GATE,
  PROTECTED_REF,
  decide,
  formatVerdict,
  gatePlan,
  gatePlanForPush,
  isProseOnlyPath,
  parsePushInput,
  runGate,
} from './pre-push-gate-core.mjs'

describe('parsePushInput', () => {
  it('reads git own pre-push lines', () => {
    const refs = parsePushInput(
      'refs/heads/main abc123 refs/heads/main def456\n' +
        'refs/heads/feat/x 111 refs/heads/feat/x 222\n',
    )
    expect(refs).toHaveLength(2)
    expect(refs[0]).toMatchObject({ remoteRef: 'refs/heads/main', localSha: 'abc123', remoteSha: 'def456' })
    expect(refs[0].deleting).toBe(false)
  })

  it('marks an all-zero local sha as a deletion', () => {
    const [ref] = parsePushInput('(delete) 0000000000000000000000000000000000000000 refs/heads/old abc')
    expect(ref.deleting).toBe(true)
  })

  it('survives empty, blank and malformed input rather than throwing', () => {
    expect(parsePushInput('')).toEqual([])
    expect(parsePushInput('\n  \n')).toEqual([])
    expect(parsePushInput(null)).toEqual([])
    // A line without a remote ref is not a push target.
    expect(parsePushInput('onlyonefield')).toEqual([])
  })
})

describe('isProseOnlyPath', () => {
  it('accepts prose, the archive and the local board', () => {
    expect(isProseOnlyPath('docs/analysis_de/retrospektive-zusammenarbeit.md')).toBe(true)
    expect(isProseOnlyPath('TASKS.md')).toBe(true)
    expect(isProseOnlyPath('CLAUDE.md')).toBe(true)
    expect(isProseOnlyPath('.batch-dashboard.html')).toBe(true)
    expect(isProseOnlyPath('verification/travel-webgpu.png')).toBe(true)
  })

  it('refuses everything a gate step can measure', () => {
    expect(isProseOnlyPath('src/config/balance.ts')).toBe(false)
    expect(isProseOnlyPath('scripts/board-core.mjs')).toBe(false)
    expect(isProseOnlyPath('package.json')).toBe(false)
    expect(isProseOnlyPath('.github/workflows/ci.yml')).toBe(false)
    // A markdown file INSIDE a source tree is not prose-only — a doc test may
    // read it (docs/graphics-detail-levels.md has a sync test).
    expect(isProseOnlyPath('src/notes.md')).toBe(false)
    expect(isProseOnlyPath('')).toBe(false)
  })

  it('reads a Windows path the same as a POSIX one', () => {
    expect(isProseOnlyPath('docs\\analysis_de\\x.md')).toBe(true)
    expect(isProseOnlyPath('src\\App.tsx')).toBe(false)
  })
})

describe('gatePlan', () => {
  it('runs everything CI runs on a push to the deployed branch', () => {
    const plan = gatePlan({ remoteRef: PROTECTED_REF, files: ['src/App.tsx'] })
    expect(plan.steps).toEqual(FULL_GATE)
  })

  it('takes the light gate for a prose-only push to main — but never skips the audit', () => {
    const plan = gatePlan({ remoteRef: PROTECTED_REF, files: ['TASKS.md', 'docs/x.md'] })
    expect(plan.steps).toEqual(LIGHT_GATE)
    expect(plan.steps).toContain('audit')
  })

  it('takes the full gate when ONE file among the prose can break something', () => {
    const plan = gatePlan({ remoteRef: PROTECTED_REF, files: ['TASKS.md', 'src/App.tsx'] })
    expect(plan.steps).toEqual(FULL_GATE)
  })

  it('takes the full gate on main when the changed files are unknown', () => {
    // An unresolvable range must not read as "nothing to check".
    expect(gatePlan({ remoteRef: PROTECTED_REF, files: [] }).steps).toEqual(FULL_GATE)
  })

  it('keeps a feature branch on the light gate — agents push per commit', () => {
    const plan = gatePlan({ remoteRef: 'refs/heads/feat/369-orphan', files: ['src/App.tsx'] })
    expect(plan.steps).toEqual(LIGHT_GATE)
    expect(plan.reason).toMatch(/not refs\/heads\/main/)
  })

  it('checks nothing when a ref is being deleted', () => {
    expect(gatePlan({ remoteRef: PROTECTED_REF, deleting: true }).steps).toEqual([])
  })
})

describe('gatePlanForPush', () => {
  it('takes the widest plan when one push carries several refs', () => {
    const plan = gatePlanForPush([
      { remoteRef: 'refs/heads/feat/x', files: ['src/App.tsx'] },
      { remoteRef: PROTECTED_REF, files: ['src/App.tsx'] },
    ])
    expect(plan.steps).toEqual(FULL_GATE)
  })

  it('reports nothing to push for an empty or nonsense list', () => {
    expect(gatePlanForPush([]).steps).toEqual([])
    expect(gatePlanForPush(null).steps).toEqual([])
  })
})

describe('decide', () => {
  it('blocks on any red and names every failed step', () => {
    const v = decide([{ step: 'build', ok: true }, { step: 'lint', ok: false }])
    expect(v).toEqual({ blocked: true, failed: ['lint'] })
  })

  it('passes an all-green run', () => {
    expect(decide(FULL_GATE.map((step) => ({ step, ok: true })))).toEqual({ blocked: false, failed: [] })
  })

  it('does not block on an empty or malformed result list — the wrapper fails open', () => {
    expect(decide([]).blocked).toBe(false)
    expect(decide(null).blocked).toBe(false)
    expect(decide([null, undefined]).blocked).toBe(false)
  })
})

describe('formatVerdict', () => {
  it('names the failing command and the deliberate way past it', () => {
    const msg = formatVerdict({ blocked: true, failed: ['unit'] }, { reason: 'push to the deployed branch' })
    expect(msg).toMatch(/PUSH BLOCKED/)
    expect(msg).toContain(GATE_COMMANDS.unit.join(' '))
    expect(msg).toMatch(/--no-verify/)
  })

  it('says why it passed, so a light gate is never mistaken for a full one', () => {
    expect(formatVerdict({ blocked: false, failed: [] }, { reason: 'prose and board only' })).toMatch(
      /green \(prose and board only\)/,
    )
  })
})

describe('runGate — a synthetic failing state stops the push', () => {
  it('stops at the first red and never runs the rest', () => {
    const ran = []
    const results = runGate(FULL_GATE, (step) => {
      ran.push(step)
      return step !== 'lint'
    })
    expect(ran).toEqual(['build', 'lint'])
    expect(decide(results)).toEqual({ blocked: true, failed: ['lint'] })
  })

  it('runs every step when they all pass', () => {
    const results = runGate(FULL_GATE, () => true)
    expect(results.map((r) => r.step)).toEqual(FULL_GATE)
    expect(decide(results).blocked).toBe(false)
  })

  it('treats anything but a literal true as a failure', () => {
    // A runner returning an exit code, undefined or a truthy object must not be
    // read as success — that is how a gate silently stops gating.
    expect(decide(runGate(['lint'], () => 0)).blocked).toBe(true)
    expect(decide(runGate(['lint'], () => undefined)).blocked).toBe(true)
    expect(decide(runGate(['lint'], () => ({}))).blocked).toBe(true)
  })

  it('hands the runner the command the core owns, not one the caller invents', () => {
    const seen = []
    runGate(['audit'], (step, cmd) => {
      seen.push([step, cmd])
      return true
    })
    expect(seen).toEqual([['audit', GATE_COMMANDS.audit]])
  })
})

// The failure this repository actually had: a pre-push gate existed while
// core.hooksPath was unset, so it could never fire. Presence is not wiring.
describe('the gate is wired, not merely present', () => {
  const read = (p) => readFileSync(resolve(REPO_ROOT, p), 'utf8')

  it('has a versioned pre-push hook that calls the gate', () => {
    const hook = read('scripts/git-hooks/pre-push')
    expect(hook).toMatch(/^#!\/bin\/sh/)
    expect(hook).toContain('scripts/pre-push-gate.mjs')
    // A worktree on a branch that predates the gate must stay pushable.
    expect(hook).toContain('[ -f scripts/pre-push-gate.mjs ] || exit 0')
  })

  it('wires core.hooksPath from npm install rather than from memory', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts.prepare).toContain('scripts/enable-hooks.mjs')
    expect(read('scripts/enable-hooks.mjs')).toContain('core.hooksPath')
  })
})

describe('the commands are the ones CI runs', () => {
  it('defines a command for every step of both gates', () => {
    for (const step of new Set([...FULL_GATE, ...LIGHT_GATE])) {
      expect(GATE_COMMANDS[step], `no command for gate step ${step}`).toBeTruthy()
    }
  })
})
