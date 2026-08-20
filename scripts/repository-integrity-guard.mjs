import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const git = (root, args) =>
  execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

/** Locate the exact shared config and checkout-local HEAD before tests run. */
export function repositoryStatePaths(root = process.cwd()) {
  const checkout = resolve(root)
  const commonDir = resolve(git(checkout, ['rev-parse', '--path-format=absolute', '--git-common-dir']))
  const headPath = resolve(git(checkout, ['rev-parse', '--path-format=absolute', '--git-path', 'HEAD']))
  return { checkout, commonDir, configPath: resolve(commonDir, 'config'), headPath }
}

/** Byte-for-byte state whose mutation makes a unit run unsafe. */
export function repositoryState(paths) {
  const refs = execFileSync('git', ['--git-dir', paths.commonDir, 'for-each-ref'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return {
    refs,
    config: readFileSync(paths.configPath),
    head: readFileSync(paths.headPath),
  }
}

const changed = (before, after, field) => !before[field].equals(after[field])

export function assertRepositoryUnchanged(before, after) {
  const fields = ['refs', 'config', 'head'].filter((field) => changed(before, after, field))
  if (fields.length === 0) return
  throw new Error(
    `UNIT SUITE MUTATED ITS LIVE REPOSITORY: ${fields.join(', ')} changed. ` +
      'Do not trust this run; inspect and restore the repository before continuing.',
  )
}

/** Vitest global setup: the returned teardown runs even after ordinary failures. */
export function protectRepository(root = process.cwd()) {
  const paths = repositoryStatePaths(root)
  const before = repositoryState(paths)
  return () => assertRepositoryUnchanged(before, repositoryState(paths))
}

export function setup(project) {
  return protectRepository(project?.config?.root ?? process.cwd())
}
