// THE PROVENANCE BOUNDARY ITSELF (point 834, four-eyes tooling): "tracked"
// means the COMMITTED bytes answer. A tracked name whose content is a working-
// tree edit, a staged edit, or a symlink to evidence outside the checkout is
// caller-controlled content wearing a tracked name — every one of them must
// read as NOT tracked, or the merger-selection boundary it guards is a bypass.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonicalTreePath, isTrackedInGit } from './git-tracked.mjs'

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
  // The repository under test pins `* text=auto eol=lf` in .gitattributes, so
  // git converts nothing on checkout. The sandbox says the same thing outright:
  // an inherited core.autocrlf would rewrite line endings on the way to the
  // working tree, and the byte comparison below would then be measuring the
  // ambient git configuration rather than the artefact.
  git(['config', 'core.autocrlf', 'false'], repo)
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

  it('refuses an untracked parent symlink INSIDE the checkout that aliases a tracked target', () => {
    // Cross-vendor re-review of point 889: alias -> docs made alias/half.json
    // validate as the tracked docs/half.json, and the alias — a path HEAD does
    // not carry — travelled into the ledger as a source. Git is asked about the
    // caller's own spelling, and HEAD:alias/half.json does not exist.
    symlinkSync(join(repo, 'docs'), join(repo, 'alias'))
    expect(isTrackedInGit('alias/half.json', { root: repo })).toBe(false)
    expect(isTrackedInGit('docs/half.json', { root: repo })).toBe(true)
    unlinkSync(join(repo, 'alias'))
  })

  it('refuses paths outside the checkout, lexical or absolute', () => {
    expect(isTrackedInGit('../outside/evil.json', { root: repo })).toBe(false)
    expect(isTrackedInGit(join(outside, 'evil.json'), { root: repo })).toBe(false)
  })

  it('refuses NON-CANONICAL spellings of an in-checkout path, which callers convert deliberately', () => {
    // Silent normalisation answered about a path the caller never spelled, and
    // the non-portable spelling could travel into the ledger (re-review round 9).
    expect(isTrackedInGit(join(repo, 'docs', 'half.json'), { root: repo })).toBe(false)
    expect(isTrackedInGit('docs/../docs/half.json', { root: repo })).toBe(false)
    expect(isTrackedInGit('./docs/half.json', { root: repo })).toBe(false)
    // canonicalTreePath is the deliberate conversion, and its output is accepted.
    expect(canonicalTreePath(join(repo, 'docs', 'half.json'), { root: repo })).toBe('docs/half.json')
    expect(canonicalTreePath('docs/../docs/half.json', { root: repo })).toBe('docs/half.json')
    expect(canonicalTreePath(join(outside, 'evil.json'), { root: repo })).toBe('')
    expect(isTrackedInGit(canonicalTreePath(join(repo, 'docs', 'half.json'), { root: repo }), { root: repo })).toBe(true)
  })

  // Cross-vendor review of point 889: the check used to ask `git status
  // --porcelain`, and an empty status is not the same statement as "these bytes
  // are the committed bytes". `assume-unchanged` and `skip-worktree` tell git to
  // stop comparing, so an edited half reports clean and its `model` field would
  // have passed as committed evidence.
  it('refuses an edited half that assume-unchanged hides from the status output', () => {
    writeFileSync(join(repo, 'docs', 'half.json'), '{"model":"hidden-by-assume-unchanged","entries":[]}\n')
    git(['update-index', '--assume-unchanged', 'docs/half.json'], repo)
    expect(git(['status', '--porcelain', '--', 'docs/half.json'], repo)).toBe('')
    expect(isTrackedInGit('docs/half.json', { root: repo })).toBe(false)
    git(['update-index', '--no-assume-unchanged', 'docs/half.json'], repo)
    git(['checkout', '-q', '--', 'docs/half.json'], repo)
  })

  it('refuses an edited half that skip-worktree hides from the status output', () => {
    git(['update-index', '--skip-worktree', 'docs/half.json'], repo)
    writeFileSync(join(repo, 'docs', 'half.json'), '{"model":"hidden-by-skip-worktree","entries":[]}\n')
    expect(git(['status', '--porcelain', '--', 'docs/half.json'], repo)).toBe('')
    expect(isTrackedInGit('docs/half.json', { root: repo })).toBe(false)
    git(['update-index', '--no-skip-worktree', 'docs/half.json'], repo)
    git(['checkout', '-q', '--', 'docs/half.json'], repo)
  })

  it('refuses a working tree that a clean/smudge filter makes report clean while its bytes differ', () => {
    // The third status-bypass mechanism beside assume-unchanged and
    // skip-worktree: a smudge filter rewrites bytes on checkout, and the
    // matching clean filter maps them back, so `git status` compares clean
    // while the bytes any consumer READS are the smudged ones.
    writeFileSync(join(repo, '.gitattributes'), 'docs/half.json filter=forge\n')
    git(['config', 'filter.forge.clean', "sed s/SMUDGED-MODEL/GPT-5.6\\ Sol/"], repo)
    git(['config', 'filter.forge.smudge', "sed s/GPT-5.6\\ Sol/SMUDGED-MODEL/"], repo)
    try {
      // Re-checkout through the smudge filter: the working bytes now differ.
      unlinkSync(join(repo, 'docs', 'half.json'))
      git(['checkout', '-q', '--', 'docs/half.json'], repo)
      expect(readFileSync(join(repo, 'docs', 'half.json'), 'utf8')).toContain('SMUDGED-MODEL')
      expect(git(['status', '--porcelain', '--', 'docs/half.json'], repo)).toBe('')
      expect(isTrackedInGit('docs/half.json', { root: repo })).toBe(false)
    } finally {
      unlinkSync(join(repo, '.gitattributes'))
      git(['config', '--unset', 'filter.forge.clean'], repo)
      git(['config', '--unset', 'filter.forge.smudge'], repo)
      unlinkSync(join(repo, 'docs', 'half.json'))
      git(['checkout', '-q', '--', 'docs/half.json'], repo)
    }
  })

  it('answers correctly from a checkout whose directory name ends in whitespace', () => {
    // .trim() on git's toplevel output clipped such a root and rejected every
    // committed artefact in it; only the line terminator may come off.
    const wsRoot = join(sandbox, 'repo-ws ')
    mkdirSync(wsRoot)
    execFileSync('git', ['init', '-q'], { windowsHide: true, cwd: wsRoot })
    git(['config', 'core.autocrlf', 'false'], wsRoot)
    writeFileSync(join(wsRoot, 'half.json'), '{"model":"Opus 5","entries":[]}\n')
    git(['add', 'half.json'], wsRoot)
    git(['commit', '-q', '-m', 'seed'], wsRoot)
    expect(isTrackedInGit('half.json', { root: wsRoot })).toBe(true)
  })

  it('checks a whitespace-bearing filename as itself, not as its trimmed cousin', () => {
    // Trimming turned " spaced.json" into "spaced.json" — a different pathname —
    // so the tracked answer was about a file the caller never named.
    writeFileSync(join(repo, 'docs', ' spaced.json'), '{"model":"Opus 5","entries":[]}\n')
    git(['add', 'docs/ spaced.json'], repo)
    git(['commit', '-q', '-m', 'track a whitespace-bearing name'], repo)
    expect(isTrackedInGit('docs/ spaced.json', { root: repo })).toBe(true)
    expect(isTrackedInGit('docs/spaced.json', { root: repo })).toBe(false)
  })

  // THE CONSUMER'S OWN BYTES ARE THE ONES THAT MUST MATCH. A caller that has
  // already read the file passes what it read, so the answer is about the text
  // it will parse rather than about a second read that could differ.
  it('judges the bytes the caller actually read when it supplies them', () => {
    const committed = '{"model":"GPT-5.6 Sol","entries":[]}\n'
    expect(isTrackedInGit('docs/half.json', { root: repo, content: committed })).toBe(true)
    expect(isTrackedInGit('docs/half.json', { root: repo, content: '{"model":"forged","entries":[]}\n' })).toBe(false)
  })

  it('refuses a file that is staged but has never been committed', () => {
    writeFileSync(join(repo, 'docs', 'fresh.json'), '{"model":"Opus 5","entries":[]}\n')
    git(['add', 'docs/fresh.json'], repo)
    expect(isTrackedInGit('docs/fresh.json', { root: repo })).toBe(false)
    git(['rm', '-q', '-f', '--cached', 'docs/fresh.json'], repo)
    unlinkSync(join(repo, 'docs', 'fresh.json'))
  })
})
