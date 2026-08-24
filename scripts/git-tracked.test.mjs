// THE PROVENANCE BOUNDARY ITSELF (point 834, four-eyes tooling): "tracked"
// means the COMMITTED bytes answer. A tracked name whose content is a working-
// tree edit, a staged edit, or a symlink to evidence outside the checkout is
// caller-controlled content wearing a tracked name — every one of them must
// read as NOT tracked, or the merger-selection boundary it guards is a bypass.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isTrackedInGit } from './git-tracked.mjs'

let sandbox, repo, outside

const git = (args, cwd) =>
  execFileSync('git', args, { windowsHide: true,
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).trim()

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'git-tracked-'))
  repo = join(sandbox, 'repo')
  outside = join(sandbox, 'outside')
  mkdirSync(repo)
  mkdirSync(outside)
  execFileSync('git', ['init', '-q'], { windowsHide: true, cwd: repo })
  mkdirSync(join(repo, 'docs'))
  writeFileSync(join(repo, 'docs', 'half.json'), '{"model":"GPT-5.6 Sol","entries":[]}\n')
  writeFileSync(join(repo, 'docs', 'other.json'), '{"model":"Opus 5","entries":[]}\n')
  git(['add', '.'], repo)
  git(['commit', '-q', '-m', 'seed'], repo)
  writeFileSync(join(outside, 'evil.json'), '{"model":"forged"}\n')
})

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

describe('isTrackedInGit — committed bytes only', () => {
  it('accepts a tracked, clean file and refuses an untracked or absent one', () => {
    expect(isTrackedInGit('docs/half.json', { root: repo })).toBe(true)
    writeFileSync(join(repo, 'docs', 'loose.json'), '{}\n')
    expect(isTrackedInGit('docs/loose.json', { root: repo })).toBe(false)
    expect(isTrackedInGit('docs/never-existed.json', { root: repo })).toBe(false)
    expect(isTrackedInGit('', { root: repo })).toBe(false)
  })

  it('refuses a tracked file MODIFIED in the working tree — the bytes read are not the bytes committed', () => {
    writeFileSync(join(repo, 'docs', 'half.json'), '{"model":"renamed-by-caller","entries":[]}\n')
    expect(isTrackedInGit('docs/half.json', { root: repo })).toBe(false)
    git(['checkout', '-q', '--', 'docs/half.json'], repo)
    expect(isTrackedInGit('docs/half.json', { root: repo })).toBe(true)
  })

  it('refuses a STAGED edit too: the index is still not a commit anybody can read', () => {
    writeFileSync(join(repo, 'docs', 'half.json'), '{"model":"staged-forgery","entries":[]}\n')
    git(['add', 'docs/half.json'], repo)
    expect(isTrackedInGit('docs/half.json', { root: repo })).toBe(false)
    git(['reset', '-q', '--', 'docs/half.json'], repo)
    git(['checkout', '-q', '--', 'docs/half.json'], repo)
  })

  it('refuses a tracked name replaced by a symlink, wherever it points', () => {
    unlinkSync(join(repo, 'docs', 'half.json'))
    symlinkSync(join(outside, 'evil.json'), join(repo, 'docs', 'half.json'))
    expect(isTrackedInGit('docs/half.json', { root: repo })).toBe(false)
    // Even a link to a DIFFERENT tracked file is refused: the recorded path's
    // committed bytes are not what a read through the link returns.
    unlinkSync(join(repo, 'docs', 'half.json'))
    symlinkSync(join(repo, 'docs', 'other.json'), join(repo, 'docs', 'half.json'))
    expect(isTrackedInGit('docs/half.json', { root: repo })).toBe(false)
    unlinkSync(join(repo, 'docs', 'half.json'))
    git(['checkout', '-q', '--', 'docs/half.json'], repo)
  })

  it('refuses a path that leaves the checkout through a symlinked PARENT directory', () => {
    symlinkSync(outside, join(repo, 'linkdir'))
    expect(isTrackedInGit('linkdir/evil.json', { root: repo })).toBe(false)
    unlinkSync(join(repo, 'linkdir'))
  })

  it('refuses paths outside the checkout, lexical or absolute', () => {
    expect(isTrackedInGit('../outside/evil.json', { root: repo })).toBe(false)
    expect(isTrackedInGit(join(outside, 'evil.json'), { root: repo })).toBe(false)
  })
})
