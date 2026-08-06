// The commit-msg gate on the authoring-model trailer (points 397 b / 425 a),
// exercised through the SPAWNED script and the hook that drives it. The pure
// decision is pinned in model-guard-core.test.mjs; what only a real run can show
// is that the hook reaches it and that a refusal exits non-zero — a gate that
// decides correctly and exits 0 refuses nothing.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const GATE = resolve(process.cwd(), 'scripts/model-trailer-gate.mjs')
const HOOK = resolve(process.cwd(), 'scripts/git-hooks/commit-msg')

const judge = (message) => {
  const dir = mkdtempSync(resolve(tmpdir(), 'hoa-model-trailer-'))
  try {
    const file = resolve(dir, 'COMMIT_EDITMSG')
    writeFileSync(file, message, 'utf8')
    return spawnSync(process.execPath, [GATE, '--message', file], { windowsHide: true, encoding: 'utf8' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const withTrailer = (trailer) => `Tick the drums that carry the message\n\n${trailer}\n`

describe('the commit-msg model-trailer gate', () => {
  it('is wired into the hook, after the scope guard', () => {
    const hook = readFileSync(HOOK, 'utf8')
    expect(hook).toContain('scripts/commit-scope-guard.mjs --message "$1" || exit 1')
    expect(hook).toContain('scripts/model-trailer-gate.mjs --message "$1"')
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
    })
    expect(missing.status).toBe(0)
    expect(spawnSync(process.execPath, [GATE], { windowsHide: true, encoding: 'utf8' }).status).toBe(0)
  })
})
