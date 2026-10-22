// Test fixture (Vitest only): a throwaway main checkout with a bare origin, so the
// carrier's origin/main proof and the doctor's rescue run against real git and
// never against the live repository.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withoutGitLocalEnvironment } from './repo-paths.mjs'

const ENV = withoutGitLocalEnvironment()

export function gitAt(dir) {
  return (...args) =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: ENV, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** A work order text holding the given points as open heads. */
export const tasksWith = (points = [], titles = {}) =>
  `# Work order\n\n${points.map((n) => `- [ ] ${n}. ${titles[n] ?? `Point ${n} title`}\n  body of ${n}\n`).join('\n')}`

/**
 * A main checkout `root` (branch main) with a bare `origin`, TASKS.md holding
 * `points` and an archive holding `archived`, committed and pushed.
 */
export function makeRepoFixture({ points = [], archived = [], titles = {} } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'hoa-carrier-repo-'))
  const origin = join(base, 'origin.git')
  const root = join(base, 'main')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env: ENV, stdio: 'ignore', windowsHide: true })
  execFileSync('git', ['init', '-q', '-b', 'main', root], { env: ENV, stdio: 'ignore', windowsHide: true })
  const git = gitAt(root)
  git('config', 'user.email', 'fixture@test')
  git('config', 'user.name', 'fixture')
  git('config', 'commit.gpgsign', 'false')
  mkdirSync(join(base, 'no-hooks'), { recursive: true })
  git('config', 'core.hooksPath', join(base, 'no-hooks'))
  git('remote', 'add', 'origin', origin)
  mkdirSync(join(root, 'docs'), { recursive: true })
  mkdirSync(join(root, '.claude'), { recursive: true })
  // The live repository ignores its batch state files; so does the fixture.
  writeFileSync(join(root, '.gitignore'), '.claude/parallel-alert.json\n.claude/doctor-state.json\n.claude/doctor.log\n.claude/batch-lock.json\n')
  writeFileSync(join(root, 'TASKS.md'), tasksWith(points, titles))
  writeFileSync(
    join(root, 'docs', 'tasks-archive.md'),
    `# Archive\n\n${archived.map((n) => `- [x] ${n}. ${titles[n] ?? `Point ${n} title`}\n`).join('\n')}`,
  )
  git('add', '-A')
  git('commit', '-qm', 'seed')
  git('push', '-q', 'origin', 'main')
  git('branch', '--set-upstream-to=origin/main', 'main')
  return { base, origin, root, git }
}

/** Append point N to the fixture's TASKS.md working copy (uncommitted). */
export function appendPoint(root, n, title = `Point ${n} title`) {
  writeFileSync(join(root, 'TASKS.md'), `${readFileSync(join(root, 'TASKS.md'), 'utf8')}\n- [ ] ${n}. ${title}\n  body of ${n}\n`)
}
