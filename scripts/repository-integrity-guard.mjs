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

/** Byte-for-byte state whose mutation makes a unit run unsafe.
 *
 * Remote-tracking refs are deliberately outside the boundary: the authoring
 * harness pushes this branch every two minutes and updates origin/* in this
 * same shared repository. Fixture damage has always landed under refs/heads;
 * those are the refs a local git command can move without network activity. */
export function repositoryState(paths) {
  const refs = execFileSync(
    'git',
    ['--git-dir', paths.commonDir, 'for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads'],
    {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const config = readFileSync(paths.configPath)
  let configEntries
  try {
    configEntries = execFileSync('git', ['config', '--file', paths.configPath, '--null', '--list'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    configEntries = null
  }
  return {
    refs,
    config,
    configEntries,
    head: readFileSync(paths.headPath),
  }
}

const changed = (before, after, field) => !before[field].equals(after[field])

const refMap = (snapshot) =>
  new Map(
    snapshot
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\0')),
  )

const refChanges = (before, after) => {
  const beforeRefs = refMap(before.refs)
  const afterRefs = refMap(after.refs)
  return [...new Set([...beforeRefs.keys(), ...afterRefs.keys()])]
    .sort()
    .filter((name) => beforeRefs.get(name) !== afterRefs.get(name))
    .map(
      (name) =>
        `${name} ${beforeRefs.get(name) ?? '<absent>'} -> ${afterRefs.get(name) ?? '<absent>'}`,
    )
}

const configMap = (snapshot) => {
  if (!snapshot.configEntries) return null
  const entries = new Map()
  for (const entry of snapshot.configEntries.toString('utf8').split('\0').filter(Boolean)) {
    const separator = entry.indexOf('\n')
    const key = separator === -1 ? entry : entry.slice(0, separator)
    const value = separator === -1 ? '' : entry.slice(separator + 1)
    entries.set(key, [...(entries.get(key) ?? []), value])
  }
  return entries
}

const configChanges = (before, after) => {
  const beforeConfig = configMap(before)
  const afterConfig = configMap(after)
  if (!beforeConfig || !afterConfig) return null
  return [...new Set([...beforeConfig.keys(), ...afterConfig.keys()])]
    .sort()
    .filter(
      (key) =>
        JSON.stringify(beforeConfig.get(key) ?? []) !== JSON.stringify(afterConfig.get(key) ?? []),
    )
}

const headValue = (snapshot) => JSON.stringify(snapshot.head.toString('utf8').trim())

export function assertRepositoryUnchanged(before, after) {
  const details = []
  if (changed(before, after, 'refs')) details.push(`refs changed: ${refChanges(before, after).join(', ')}`)
  if (changed(before, after, 'config')) {
    const keys = configChanges(before, after)
    details.push(
      keys === null
        ? 'config changed (the config could not be parsed)'
        : keys.length > 0
          ? `config changed (keys: ${keys.join(', ')})`
          : 'config changed (raw bytes changed; parsed keys are identical)',
    )
  }
  if (changed(before, after, 'head')) {
    details.push(`head changed: ${headValue(before)} -> ${headValue(after)}`)
  }
  if (details.length === 0) return
  throw new Error(
    `LIVE REPOSITORY CHANGED WHILE UNIT SUITE RAN: ${details.join('; ')}. ` +
      'This may be test leakage, but a legitimate commit or branch operation in another worktree ' +
      'during the run produces the same result. Inspect the named changes and concurrent activity ' +
      'before deciding whether any restoration is needed.',
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
