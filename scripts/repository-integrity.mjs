import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { withoutGitLocalEnvironment } from './repo-paths.mjs'

const git = (root, args) =>
  execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

const isolatedGit = (args) =>
  execFileSync('git', args, {
    windowsHide: true,
    env: withoutGitLocalEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

/** Locate the exact shared config and checkout-local HEAD before tests run. */
export function repositoryStatePaths(root = process.cwd()) {
  const checkout = resolve(root)
  const commonDir = resolve(git(checkout, ['rev-parse', '--path-format=absolute', '--git-common-dir']))
  const headPath = resolve(git(checkout, ['rev-parse', '--path-format=absolute', '--git-path', 'HEAD']))
  return { checkout, commonDir, configPath: resolve(commonDir, 'config'), headPath }
}

const worktreeAdministrativeDirectories = (commonDir) => {
  const found = [['main', commonDir]]
  try {
    const worktreesDir = resolve(commonDir, 'worktrees')
    for (const entry of readdirSync(worktreesDir, { withFileTypes: true })
      .filter((candidate) => candidate.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      found.push([`worktrees/${entry.name}`, resolve(worktreesDir, entry.name)])
    }
  } catch {
    // A repository with no linked worktrees has no worktrees/ directory.
  }
  return found
}

const administrativeFileState = (commonDir, name) =>
  Buffer.from(
    JSON.stringify(
      worktreeAdministrativeDirectories(commonDir).map(([key, directory]) => {
        try {
          return [key, readFileSync(resolve(directory, name)).toString('base64')]
        } catch {
          return [key, null]
        }
      }),
    ),
  )

/** Byte-for-byte state whose mutation makes a unit run unsafe.
 *
 * Remote-tracking refs are deliberately outside the boundary: the authoring
 * harness pushes this branch every two minutes and updates origin/* in this
 * same shared repository. Fixture damage has always landed under refs/heads;
 * those are the refs a local git command can move without network activity. */
export function repositoryState(paths) {
  const refs = isolatedGit(
    ['--git-dir', paths.commonDir, 'for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads'],
  )
  const config = readFileSync(paths.configPath)
  let configEntries
  try {
    configEntries = isolatedGit(['config', '--file', paths.configPath, '--null', '--list'])
  } catch {
    configEntries = null
  }
  return {
    refs,
    config,
    configEntries,
    head: readFileSync(paths.headPath),
    worktrees: isolatedGit(['--git-dir', paths.commonDir, 'worktree', 'list', '--porcelain', '-z']),
    worktreeHeads: administrativeFileState(paths.commonDir, 'HEAD'),
    worktreeIndexes: administrativeFileState(paths.commonDir, 'index'),
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
  if (changed(before, after, 'worktrees')) details.push('worktree registrations changed')
  if (changed(before, after, 'worktreeHeads')) details.push('one or more worktree HEADs changed')
  if (changed(before, after, 'worktreeIndexes')) details.push('one or more worktree indexes changed')
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

/** ANNOUNCE THAT THE RUNNER REALLY CALLED THIS (GPT-5.6 Sol, review of aeedceb).
 *  The wiring is a claim about the CONFIGURATION Vitest loaded, and neither a text
 *  search nor a re-import can prove it: a commented-out line reads identically, and
 *  the config cannot be imported inside the jsdom workers at all. So the setup says
 *  so itself, through the one channel that only a real invocation can write —
 *  `provide`, which the suite reads back with `inject`. A false all-clear about
 *  wiring is the failure this whole family exists to prevent. */
export const WIRED_KEY = 'repositoryIntegrityWired'

const scrubRunnerGitEnvironment = () => {
  const clean = withoutGitLocalEnvironment()
  for (const name of Object.keys(process.env)) {
    if (!(name in clean)) delete process.env[name]
  }
}

export function setup(project) {
  // Global setup runs in Vitest's main process before its workers start. A
  // linked-worktree hook supplies GIT_DIR as an absolute path, and workers
  // otherwise inherit it: every fixture's `git -C <tmpdir>` then targets the
  // live repository instead. Remove Git's entire repository-local identity at
  // this one suite-wide boundary so every present and future gate caller is
  // safe; the wrapper-level clean environments remain defence in depth.
  scrubRunnerGitEnvironment()
  project?.provide?.(WIRED_KEY, true)
  return protectRepository(project?.config?.root ?? process.cwd())
}
