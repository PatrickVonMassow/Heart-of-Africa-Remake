// GIVE A FRESH AGENT WORKTREE ITS DEPENDENCIES — one command, idempotent.
// (The decision is pure in worktree-bootstrap-core.mjs; this module acts on it.)
//
//   node scripts/worktree-bootstrap.mjs         bootstrap this checkout
//   node scripts/worktree-bootstrap.mjs --dry   say what it would do
//
// Run it as the FIRST command in a new worktree, before any gate. In the main
// checkout it is a no-op, so it is always safe to run.
//
// THE LINK IS THE FAST PATH: a directory symlink (a junction on Windows) to the
// main checkout's `node_modules`, taking a second instead of the minutes a real
// install costs, and only when the two `package-lock.json` files are byte
// identical — a branch that changed the lockfile gets a real `npm ci` instead,
// because linking would silently test against the wrong dependency tree.
//
// REMOVING SUCH A WORKTREE STAYS THE JOB OF `scripts/worktree-cleanup.mjs`,
// which DETACHES the link before deleting: `git worktree remove` and `rm -rf`
// follow it and delete the MAIN tree's dependencies (that happened twice on
// 29.07.2026, which is why that script exists).
import { existsSync, readFileSync, symlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { ACTIONS, mainCheckoutFrom, planBootstrap, formatPlan } from './worktree-bootstrap-core.mjs'

const read = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** `git rev-parse --git-common-dir`, absolute, or null when git says nothing. */
export function gitCommonDir(cwd = REPO_ROOT) {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (r.status !== 0 || typeof r.stdout !== 'string') return null
  const out = r.stdout.trim()
  return out === '' ? null : out
}

/** Gather the disk state this checkout is in, and decide. */
export function inspect(root = REPO_ROOT) {
  const main = mainCheckoutFrom(gitCommonDir(root), root)
  return planBootstrap({
    hasOwnDeps: existsSync(join(root, 'node_modules')),
    mainCheckout: main,
    mainHasDeps: main !== null && existsSync(join(main, 'node_modules')),
    ownLock: read(join(root, 'package-lock.json')),
    mainLock: main === null ? null : read(join(main, 'package-lock.json')),
  })
}

/** Link the donor's node_modules into `root`. Junction on Windows — a plain
 *  `symlink` there needs a privilege an agent session does not have. */
export function linkDependencies(root, donor) {
  symlinkSync(join(donor, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
}

/** A real install into `root`. `npm ci` is the lockfile-faithful form, and this
 *  path is only reached when the lockfile is the thing that differs. */
export function installDependencies(root) {
  const r = spawnSync('npm', ['ci'], { cwd: root, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' })
  return r.status === 0
}

export function bootstrap(root = REPO_ROOT, { dry = false } = {}) {
  const plan = inspect(root)
  console.log(formatPlan(plan, root))
  if (dry || plan.action === ACTIONS.none) return true
  if (plan.action === ACTIONS.link) {
    linkDependencies(root, plan.from)
    console.log(`worktree-bootstrap: linked ${join(plan.from, 'node_modules')} -> ${join(root, 'node_modules')}`)
    return true
  }
  return installDependencies(root)
}

if (isMainModule(import.meta.url)) {
  const dry = process.argv.includes('--dry')
  const root = resolve(process.argv.find((a, i) => i > 1 && !a.startsWith('--')) ?? REPO_ROOT)
  process.exit(bootstrap(root, { dry }) ? 0 : 1)
}
