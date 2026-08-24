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
// then compares the BYTES THE CALLER READ with the blob HEAD carries.
//
// THE COMPARISON IS ON CONTENT, NOT ON `git status` (cross-vendor review of
// point 889). An empty porcelain status does not establish that the bytes read
// from the working tree equal the committed blob: `assume-unchanged` and
// `skip-worktree` suppress the comparison outright, and a clean/smudge filter
// makes a differing working tree report clean by design — either would let an
// edited `model` field pass as committed evidence. Hashing the bytes and
// comparing the oid asks the question the contract actually makes.
//
// The caller passes the bytes it read as `content`; a caller that has not read
// the file yet leaves it out and the file is read here. Only the first form
// proves the contract end to end — that what the tooling PARSED is what the
// repository carries — so every four-eyes consumer supplies it.
//
// Cross-vendor review of point 834 found the first version of this check applied
// in one command and not the other, so it lives here once and both import it.
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { relative, resolve as resolvePath, sep } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'

export function isTrackedInGit(path, { root = REPO_ROOT, run = spawnSync, content } = {}) {
  // THE CALLER'S SPELLING, UNTOUCHED: trimming rewrote a legal filename that
  // begins or ends with whitespace into a different pathname (re-review round
  // 5). Only an argument that is nothing but whitespace is refused.
  const raw = String(path ?? '')
  if (!raw.trim()) return false
  const real = run('git', ['rev-parse', '--path-format=absolute', '--show-toplevel'], {
    windowsHide: true,
    cwd: root,
    encoding: 'utf8',
  })
  if (real.status !== 0) return false
  // Only git's own line terminator comes off: .trim() would clip a checkout
  // directory whose NAME ends in whitespace and reject every artefact in it
  // (re-review round 6).
  const top = String(real.stdout ?? '').replace(/\r?\n$/, '')
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
  // THE CALLER'S OWN SPELLING IS WHAT GIT IS ASKED ABOUT (cross-vendor
  // re-review of point 889): deriving the tracked path from the RESOLVED
  // target let an untracked parent symlink inside the checkout — alias ->
  // docs/four-eyes — validate alias/A.json as its target, and the alias then
  // travelled into the ledger as a source HEAD does not carry. The lexical
  // relative path is what is probed, and the resolved path must be exactly
  // where that lexical path lands — any parent symlink makes them differ.
  const inside = relative(topReal, resolvePath(root, raw))
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || inside.startsWith('../')) return false
  if (abs !== resolvePath(topReal, inside)) return false
  // Git's tree paths use '/' whatever the platform; only the PLATFORM separator
  // is converted, so a POSIX filename containing a literal backslash survives
  // (re-review round 8).
  const treePath = sep === '\\' ? inside.split(sep).join('/') : inside
  const probe = run('git', ['ls-files', '--error-unmatch', '--', treePath], {
    windowsHide: true,
    cwd: topReal,
    encoding: 'utf8',
  })
  if (probe.status !== 0) return false
  // The blob the repository carries at this path. A file that is in the index
  // but not in HEAD has no committed bytes to be equal to, and fails here.
  const head = run('git', ['rev-parse', `HEAD:${treePath}`], {
    windowsHide: true,
    cwd: topReal,
    encoding: 'utf8',
  })
  if (head.status !== 0) return false
  let bytes
  try {
    bytes = content === undefined ? readFileSync(abs) : Buffer.from(String(content), 'utf8')
  } catch {
    return false
  }
  const hashed = run('git', ['hash-object', '--stdin'], {
    windowsHide: true,
    cwd: topReal,
    encoding: 'utf8',
    input: bytes,
  })
  if (hashed.status !== 0) return false
  return String(hashed.stdout ?? '').trim() === String(head.stdout ?? '').trim()
}
