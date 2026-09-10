import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
  const indexPath = resolve(git(checkout, ['rev-parse', '--path-format=absolute', '--git-path', 'index']))
  return { checkout, commonDir, configPath: resolve(commonDir, 'config'), headPath, indexPath }
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

const optionalFile = (path) => {
  try {
    return readFileSync(path)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

const administrativeFileState = (paths, name) =>
  Buffer.from(
    JSON.stringify(
      worktreeAdministrativeDirectories(paths.commonDir)
        .filter(([, directory]) => directory !== dirname(paths.headPath))
        .map(([key, directory]) => {
          try {
            return [key, readFileSync(resolve(directory, name)).toString('base64')]
          } catch {
            return [key, null]
          }
        }),
    ),
  )

/** Capture owned state for enforcement and foreign state for run-log diagnostics.
 *
 * Remote-tracking refs are deliberately outside the boundary: the authoring
 * harness pushes this branch every two minutes and updates origin/* in this
 * same shared repository. Other local branches and worktrees are observed, but
 * cannot be enforced: a legitimate concurrent author changes the same bytes. */
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
    index: optionalFile(paths.indexPath),
    worktrees: isolatedGit(['--git-dir', paths.commonDir, 'worktree', 'list', '--porcelain', '-z']),
    foreignWorktreeHeads: administrativeFileState(paths, 'HEAD'),
    foreignWorktreeIndexes: administrativeFileState(paths, 'index'),
  }
}

const changed = (before, after, field) =>
  before[field] === null || after[field] === null
    ? before[field] !== after[field]
    : !before[field].equals(after[field])

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
      (name) => ({
        name,
        detail: `${name} ${beforeRefs.get(name) ?? '<absent>'} -> ${afterRefs.get(name) ?? '<absent>'}`,
      }),
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
  const foreign = []
  // Bind ownership to the initial HEAD, even if the suite switches branches.
  // Detached HEADs own no branch ref; unborn branches still own their named ref.
  const ownRef = /^ref: (.+)$/.exec(before.head.toString('utf8').trim())?.[1]
  for (const { name, detail } of refChanges(before, after)) {
    if (name === ownRef) details.push(`own branch ref changed: ${detail}`)
    else foreign.push(`foreign ref changed: ${detail}`)
  }
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
  if (changed(before, after, 'index')) details.push('own index changed')
  if (changed(before, after, 'worktrees')) foreign.push('worktree registrations changed')
  if (changed(before, after, 'foreignWorktreeHeads')) foreign.push('foreign worktree HEADs changed')
  if (changed(before, after, 'foreignWorktreeIndexes')) foreign.push('foreign worktree indexes changed')
  for (const detail of foreign) {
    console.info(`REPOSITORY INTEGRITY (informational): ${detail}; does not fail the unit run.`)
  }
  if (details.length === 0) return
  throw new Error(
    `LIVE REPOSITORY CHANGED WHILE UNIT SUITE RAN: ${details.join('; ')}. ` +
      'The running worktree\'s own HEAD, index, branch ref, or shared config changed. ' +
      'Inspect these changes for test leakage before deciding whether any restoration is needed.',
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
