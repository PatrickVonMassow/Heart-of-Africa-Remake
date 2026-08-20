// The commit-msg gate on the authoring-model trailer (points 397 b / 425 a),
// exercised through the SPAWNED script and the hook that drives it. The pure
// decision is pinned in model-guard-core.test.mjs; what only a real run can show
// is that the hook reaches it and that a refusal exits non-zero — a gate that
// decides correctly and exits 0 refuses nothing.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { writeState } from './fable-switch-core.mjs'

const GATE = resolve(process.cwd(), 'scripts/model-trailer-gate.mjs')
const HOOK = resolve(process.cwd(), 'scripts/git-hooks/commit-msg')

const stateFile = (dir, state = 'on') => {
  const file = resolve(dir, 'fable-switch.json')
  writeFileSync(file, JSON.stringify(writeState(state, { why: 'test decision', by: 'test', now: 1 })))
  return file
}

const judge = (message) => {
  const dir = mkdtempSync(resolve(tmpdir(), 'hoa-model-trailer-'))
  try {
    const file = resolve(dir, 'COMMIT_EDITMSG')
    writeFileSync(file, message, 'utf8')
    return spawnSync(process.execPath, [GATE, '--message', file], {
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, FABLE_SWITCH_FILE: stateFile(dir) },
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const withTrailer = (trailer) => `Tick the drums that carry the message\n\n${trailer}\n`

describe('the commit-msg model-trailer gate', () => {
  it('is wired into the hook, after the scope guard', () => {
    const hook = readFileSync(HOOK, 'utf8')
    const scope = hook.indexOf('scripts/commit-scope-guard.mjs --message "$1" || exit 1')
    const gate = hook.indexOf('scripts/model-trailer-gate.mjs --message "$1"')
    expect(scope, 'the scope guard is no longer driven by the hook').toBeGreaterThan(-1)
    expect(gate, 'the trailer gate is not wired into the hook').toBeGreaterThan(-1)
    expect(gate, 'the trailer gate must run AFTER the scope guard').toBeGreaterThan(scope)
  })

  it('accepts every allowed spelling', () => {
    for (const t of [
      'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
      'Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>',
      'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>',
      'Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>',
    ]) {
      const r = judge(withTrailer(t))
      expect(r.status, `${t} was refused: ${r.stderr}`).toBe(0)
    }
  })

  it('REFUSES the bare trailer that cost the batch a round, and says what to write', () => {
    const r = judge(withTrailer('Co-Authored-By: Claude <noreply@anthropic.com>'))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('unnamed-model-trailer')
    expect(r.stderr).toContain('Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
    expect(r.stderr).toContain('~/.claude/projects/')
  })

  it('REFUSES a model outside the allowlist', () => {
    const r = judge(withTrailer('Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>'))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('forbidden-model-trailer')
  })

  it('lets an ordinary and a human-co-authored message through', () => {
    expect(judge('Hold the freed lock for the window it was freed for\n').status).toBe(0)
    expect(judge(withTrailer('Co-Authored-By: Patrick von Massow <patrick@example.com>')).status).toBe(0)
  })

  it('never blocks on a missing or unnamed message file', () => {
    const missing = spawnSync(process.execPath, [GATE, '--message', resolve(tmpdir(), 'no-such-msg')], {
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, FABLE_SWITCH_FILE: stateFile(tmpdir()) },
    })
    expect(missing.status).toBe(0)
    expect(spawnSync(process.execPath, [GATE], {
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, FABLE_SWITCH_FILE: stateFile(tmpdir()) },
    }).status).toBe(0)
  })
})

// THE LIVE CASE: a real commit through the real hook, in an ISOLATED temp repo.
// The cases above prove the decision; only this proves that an unnamed trailer
// cannot REACH history, which is the whole claim of the point.
describe('a real commit through the commit-msg hook', () => {
  // The hook exits 0 when the scope guard is absent (a worktree on an older
  // branch), so the temp repo needs it too — otherwise this case would pass
  // while the gate never ran.
  const NEEDED = [
    'commit-scope-guard.mjs',
    'commit-scope-guard-core.mjs',
    'model-trailer-gate.mjs',
    'model-guard-core.mjs',
    'fable-switch.mjs',
    'fable-switch-core.mjs',
    'atomic-write.mjs',
    'repo-paths.mjs',
    'is-main.mjs',
  ]

  const inRepo = (fn) => {
    const repo = mkdtempSync(resolve(tmpdir(), 'hoa-trailer-repo-'))
    try {
      mkdirSync(resolve(repo, 'scripts/git-hooks'), { recursive: true })
      for (const name of NEEDED) {
        copyFileSync(resolve(process.cwd(), 'scripts', name), resolve(repo, 'scripts', name))
      }
      copyFileSync(HOOK, resolve(repo, 'scripts/git-hooks/commit-msg'))
      const fable = stateFile(repo)
      const vcs = (...args) =>
        spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], {
          cwd: repo,
          windowsHide: true,
          encoding: 'utf8',
          env: { ...process.env, FABLE_SWITCH_FILE: fable },
        })
      vcs('init', '-q')
      vcs('config', 'user.email', 'gate@test.local')
      vcs('config', 'user.name', 'gate test')
      vcs('config', 'core.hooksPath', 'scripts/git-hooks')
      writeFileSync(resolve(repo, 'README.md'), 'x\n')
      vcs('add', '-A')
      return fn(vcs)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  }

  it('refuses the bare trailer and accepts the named one', () => {
    inRepo((vcs) => {
      const refused = vcs('commit', '-m', 'A probe\n\nCo-Authored-By: Claude <noreply@anthropic.com>')
      expect(refused.status, `the hook let the bare trailer through: ${refused.stdout}`).not.toBe(0)
      expect(refused.stderr).toContain('unnamed-model-trailer')
      expect(vcs('log', '--oneline').stdout.trim()).toBe('')

      const ok = vcs('commit', '-q', '-m', 'A probe\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
      expect(ok.status, `the hook refused a named trailer: ${ok.stderr}`).toBe(0)
      expect(vcs('log', '--oneline').stdout.trim()).not.toBe('')
    })
  })
})
