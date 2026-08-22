// Is a path a TRACKED repository artefact?
//
// The four-eyes tooling decides who may merge a blind-parallel stage from the
// `model` field of the two halves. That question may only be settled by files
// the repository carries: an arbitrary path is written by whoever runs the
// command, and a caller who may write the halves can name authors that leave
// itself untainted. Tracking does not make a half unforgeable — it makes a
// forgery a commit somebody can read, which is the footing every other claim in
// the ledger already stands on.
//
// Cross-vendor review of point 834 found the first version of this check applied
// in one command and not the other, so it lives here once and both import it.
import { spawnSync } from 'node:child_process'
import { relative, resolve as resolvePath } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'

/**
 * True only for a path INSIDE the repository that git tracks, with symlinks and
 * `..` resolved first — an absolute path, a path outside the checkout and a
 * symlink pointing out of it are all refused rather than followed.
 */
export function isTrackedInGit(path, { root = REPO_ROOT, run = spawnSync } = {}) {
  const raw = String(path ?? '').trim()
  if (!raw) return false
  // `git ls-files` resolves nothing: it matches on the recorded path, so a
  // symlink or a `..` segment reaching outside would be asked about literally.
  const real = run('git', ['rev-parse', '--path-format=absolute', '--show-toplevel'], {
    windowsHide: true,
    cwd: root,
    encoding: 'utf8',
  })
  if (real.status !== 0) return false
  const top = String(real.stdout ?? '').trim()
  const inside = relative(top, resolvePath(root, raw))
  if (!inside || inside.startsWith('..') || resolvePath(top, inside) !== resolvePath(root, raw)) return false
  const probe = run('git', ['ls-files', '--error-unmatch', '--', inside], {
    windowsHide: true,
    cwd: top,
    encoding: 'utf8',
  })
  return probe.status === 0
}
