// Is a path a TRACKED, CLEAN repository artefact?
//
// The four-eyes tooling decides who may merge a blind-parallel stage from the
// `model` field of the two halves. That question may only be settled by files
// the repository carries: an arbitrary path is written by whoever runs the
// command, and a caller who may write the halves can name authors that leave
// itself untainted. Tracking does not make a half unforgeable — it makes a
// forgery a commit somebody can read, which is the footing every other claim in
// the ledger already stands on.
//
// TRACKED MEANS THE COMMITTED BYTES ANSWER. `git ls-files` alone proves only
// index membership: a tracked name replaced by a symlink to mutable external
// evidence, or simply edited in the working tree, would still answer true
// while the bytes the tooling reads are the caller's, not the repository's. So
// the check refuses a symlink at the path itself, resolves the REAL path (a
// parent directory that is a link out of the checkout fails containment), and
// requires the working tree CLEAN for that path — no unstaged or staged
// difference between what is read and what is committed.
//
// Cross-vendor review of point 834 found the first version of this check applied
// in one command and not the other, so it lives here once and both import it.
import { spawnSync } from 'node:child_process'
import { lstatSync, realpathSync } from 'node:fs'
import { relative, resolve as resolvePath } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'

export function isTrackedInGit(path, { root = REPO_ROOT, run = spawnSync } = {}) {
  const raw = String(path ?? '').trim()
  if (!raw) return false
  const real = run('git', ['rev-parse', '--path-format=absolute', '--show-toplevel'], {
    windowsHide: true,
    cwd: root,
    encoding: 'utf8',
  })
  if (real.status !== 0) return false
  const top = String(real.stdout ?? '').trim()
  // The path itself may not be a symlink, wherever it points: the bytes read
  // through it are whatever the link's owner serves, not the tracked blob.
  let abs
  try {
    if (lstatSync(resolvePath(root, raw)).isSymbolicLink()) return false
    // realpath resolves every PARENT link too, so a directory symlinked out of
    // the checkout fails the containment check below instead of passing a
    // lexical prefix test.
    abs = realpathSync(resolvePath(root, raw))
  } catch {
    return false // absent or unreadable is not a tracked artefact
  }
  let topReal
  try {
    topReal = realpathSync(top)
  } catch {
    return false
  }
  const inside = relative(topReal, abs)
  if (!inside || inside.startsWith('..') || resolvePath(topReal, inside) !== abs) return false
  const probe = run('git', ['ls-files', '--error-unmatch', '--', inside], {
    windowsHide: true,
    cwd: topReal,
    encoding: 'utf8',
  })
  if (probe.status !== 0) return false
  // CLEAN, or the answer is about bytes nobody committed: a tracked file with
  // working-tree or staged changes is caller-controlled content wearing a
  // tracked name. `--porcelain` prints nothing exactly when the path matches
  // its committed state.
  const status = run('git', ['status', '--porcelain', '--', inside], {
    windowsHide: true,
    cwd: topReal,
    encoding: 'utf8',
  })
  return status.status === 0 && String(status.stdout ?? '').trim() === ''
}
