/**
 * The housekeeping 'branches' step (point 1513): old rescue/doctor-* and
 * claude/* branches, local and on origin, whose content main already holds.
 *
 * Facts are read here, the verdict is `branchVerdict` (housekeeping-core.mjs).
 * A branch checked out in any worktree is kept, re-read right before deletion. A local branch is deleted with
 * its old sha as the guard (`update-ref -d`); origin branches go in ONE push,
 * each guarded by --force-with-lease on the sha this run judged.
 */
import { branchKind, branchVerdict } from './housekeeping-core.mjs'

const PATTERNS = ['refs/heads/rescue/', 'refs/heads/claude/']
const ok = (r) => r && r.status === 0

/**
 * Names checked out in any worktree, or null when the list is unreadable:
 * every record needs `worktree <path>` and either `bare` or `HEAD <sha>` with
 * `branch refs/heads/<name>` or `detached`; anything else is malformed.
 */
export function checkedOutBranches(porcelain) {
  if (typeof porcelain !== 'string') return null
  const out = new Set()
  const records = porcelain.split(/\n\s*\n/).map((r) => r.split('\n').map((l) => l.trim()).filter(Boolean)).filter((r) => r.length)
  if (!records.length) return null
  for (const rec of records) {
    if (!/^worktree \S/.test(rec[0])) return null
    let head = false
    let state = null
    for (const line of rec.slice(1)) {
      const m = /^branch refs\/heads\/(\S+)$/.exec(line)
      if (m || line === 'detached' || line === 'bare') {
        if (state) return null // two states in one record
        state = m ? 'branch' : line
        if (m) out.add(m[1])
      } else if (/^HEAD [0-9a-f]{40}$/.test(line)) head = true
      else if (!/^(locked|prunable)( |$)/.test(line)) return null
    }
    if (state === 'bare' ? head : !(head && state)) return null
  }
  return out
}

/** [{ where: 'local'|'origin', name, sha }] — or null for a side that cannot be read. */
export function listBranches(runGit, repoRoot) {
  const local = runGit(['for-each-ref', '--format=%(objectname) %(refname)', ...PATTERNS], repoRoot)
  const remote = runGit(['ls-remote', '--heads', 'origin', 'rescue/*', 'claude/*'], repoRoot)
  const parse = (r, where) =>
    ok(r)
      ? String(r.stdout)
          .split('\n')
          .map((l) => /^([0-9a-f]{40})\s+refs\/heads\/(.+)$/.exec(l.trim()))
          .filter((m) => m && branchKind(m[2]))
          .map((m) => ({ where, name: m[2], sha: m[1] }))
      : null
  return { local: parse(local, 'local'), origin: parse(remote, 'origin') }
}

/** Committer time of `sha` in ms, or null when the object is not here. */
function tipAt(runGit, repoRoot, sha) {
  const r = runGit(['log', '-1', '--format=%ct', sha, '--'], repoRoot)
  const s = ok(r) ? Number(String(r.stdout).trim()) : NaN
  return Number.isFinite(s) && s > 0 ? s * 1000 : null
}

/** Main commits since the fork a branch is checked against (newest first). */
export const CONTAINMENT_MAX_COMMITS = 200

/**
 * Did main take the branch's content? true when merging `sha` into main, or
 * into a main commit since the fork that touched the branch's paths, yields
 * that commit's own tree (main carried it; later edits are main's own).
 * false when none does, null when git cannot answer (= unknown, keep).
 */
export function mainHeldBranch(runGit, repoRoot, sha, mainRef = 'main') {
  const base = runGit(['merge-base', mainRef, sha], repoRoot)
  if (!ok(base)) return null
  const b = String(base.stdout).trim()
  const paths = runGit(['diff', '--name-only', '--no-renames', '-z', b, sha], repoRoot)
  if (!ok(paths)) return null
  const list = String(paths.stdout).split('\0').filter(Boolean)
  if (!list.length) return true
  // First parent only: main's own snapshots, never a side branch merged in.
  const since = runGit(['rev-list', '--first-parent', `--max-count=${CONTAINMENT_MAX_COMMITS}`, mainRef, `^${b}`, '--', ...list], repoRoot)
  if (!ok(since)) return null
  const tip = runGit(['rev-parse', '--verify', `${mainRef}^{commit}`], repoRoot)
  if (!ok(tip)) return null
  const candidates = [String(tip.stdout).trim(), ...String(since.stdout).split('\n').map((l) => l.trim()).filter(Boolean)]
  for (const c of new Set(candidates)) {
    const tree = runGit(['rev-parse', '--verify', `${c}^{tree}`], repoRoot)
    if (!ok(tree)) return null
    const merged = runGit(['merge-tree', '--write-tree', '--no-messages', c, sha], repoRoot)
    // Exit 1 = conflicts: not held at this commit.
    if (merged?.status === 1) continue
    if (!ok(merged)) return null
    const first = String(merged.stdout).split('\n')[0].trim()
    if (!/^[0-9a-f]{40}$/.test(first)) return null
    if (first === String(tree.stdout).trim()) return true
  }
  return false
}

/**
 * Judge every branch and (unless dry) delete the ones the rule frees.
 * `emit` writes manifest lines, `fail` records a failure kind. Returns the step result.
 */
export function runBranchesStep({ runGit, repoRoot, now, dryRun, workOrder, archiveText, readWorktrees, emit, fail, contained }) {
  const readHeld = () => {
    try {
      return checkedOutBranches(readWorktrees())
    } catch {
      return null
    }
  }
  const held = readHeld()
  if (!held) {
    fail('branches-worktrees-unreadable', 'git worktree list unreadable; branches step skipped')
    return 'skipped'
  }
  const { local, origin } = listBranches(runGit, repoRoot)
  if (!local) fail('branches-local-unreadable', 'for-each-ref failed')
  if (!origin) fail('branches-origin-unreadable', 'ls-remote origin failed')
  const judge = contained ?? ((sha) => mainHeldBranch(runGit, repoRoot, sha))
  const doomedOrigin = []
  for (const b of [...(local ?? []), ...(origin ?? [])]) {
    const path = b.where === 'origin' ? `origin:refs/heads/${b.name}` : `refs/heads/${b.name}`
    if (b.where === 'local' && held.has(b.name)) {
      emit({ path, size: 0, rule: 'branch', outcome: 'kept', reason: 'checked out in a worktree' })
      continue
    }
    const v = branchVerdict({ name: b.name, tipAtMs: tipAt(runGit, repoRoot, b.sha), now, contained: judge(b.sha), archiveText, workOrder })
    if (!v.act) {
      emit({ path, size: 0, rule: 'branch', outcome: 'kept', reason: v.reason })
      continue
    }
    if (dryRun) {
      emit({ path, size: 0, rule: v.rule, outcome: 'would-delete', reason: b.sha })
      continue
    }
    if (b.where === 'origin') {
      doomedOrigin.push({ ...b, path, rule: v.rule })
      continue
    }
    // A worktree may have checked it out since the first read; the sha guard
    // alone would not notice, as checkout leaves the ref where it was.
    const heldNow = readHeld()
    if (!heldNow || heldNow.has(b.name)) {
      emit({ path, size: 0, rule: 'branch', outcome: 'kept', reason: heldNow ? 'checked out in a worktree' : 'worktree list unreadable' })
      continue
    }
    const r = runGit(['update-ref', '-d', `refs/heads/${b.name}`, b.sha], repoRoot)
    if (!ok(r)) fail('branch-delete-failed', `${path}: ${String(r?.stderr || '').slice(0, 200)}`)
    emit({ path, size: 0, rule: v.rule, outcome: ok(r) ? 'deleted' : 'failed', reason: b.sha })
  }
  if (doomedOrigin.length) {
    const args = ['push', '--porcelain', 'origin']
    for (const b of doomedOrigin) args.push(`--force-with-lease=refs/heads/${b.name}:${b.sha}`)
    for (const b of doomedOrigin) args.push(`:refs/heads/${b.name}`)
    const r = runGit(args, repoRoot)
    // --porcelain: `<flag>\t<from>:<to>\t<summary>`; '-' deleted, '!' rejected.
    const deleted = new Set()
    for (const l of String(r?.stdout ?? '').split('\n')) {
      const f = l.split('\t')
      if (f[0] === '-' && f.length >= 2) deleted.add(f[1].slice(f[1].indexOf(':') + 1))
    }
    for (const b of doomedOrigin) {
      const gone = deleted.has(`refs/heads/${b.name}`)
      if (!gone) fail('branch-delete-failed', `${b.path}: push did not delete it`)
      emit({ path: b.path, size: 0, rule: b.rule, outcome: gone ? 'deleted' : 'failed', reason: b.sha })
    }
  }
  return local && origin ? (dryRun ? 'planned' : 'done') : 'partial'
}
