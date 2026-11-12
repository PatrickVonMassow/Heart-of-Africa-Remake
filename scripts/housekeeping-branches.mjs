/**
 * The housekeeping 'branches' step (point 1513): old rescue/doctor-* and
 * claude/* branches, local and on origin, whose content main already holds.
 *
 * Facts are read here, the verdict is `branchVerdict` (housekeeping-core.mjs).
 * A branch checked out in any worktree is kept. A local branch is deleted with
 * its old sha as the guard (`update-ref -d`); origin branches go in ONE push,
 * each guarded by --force-with-lease on the sha this run judged.
 */
import { branchKind, branchVerdict, contentContained } from './housekeeping-core.mjs'

const PATTERNS = ['refs/heads/rescue/', 'refs/heads/claude/']
const ok = (r) => r && r.status === 0

/** Names checked out in any worktree, or null when the list is unreadable. */
export function checkedOutBranches(porcelain) {
  if (typeof porcelain !== 'string') return null
  const out = new Set()
  for (const line of porcelain.split('\n')) {
    const m = /^branch refs\/heads\/(.+)$/.exec(line.trim())
    if (m) out.add(m[1])
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

/** The change list `contentContained` judges, or null (= unknown, keep). */
export function branchChanges(runGit, repoRoot, sha, mainRef = 'main') {
  const base = runGit(['merge-base', mainRef, sha], repoRoot)
  if (!ok(base)) return null
  const b = String(base.stdout).trim()
  const numstat = runGit(['diff', '--numstat', '--no-renames', '-z', b, sha], repoRoot)
  const status = runGit(['diff', '--name-status', '--no-renames', '-z', b, sha], repoRoot)
  const patch = runGit(['diff', '-U0', '--no-renames', '--no-color', '--no-ext-diff', b, sha], repoRoot)
  if (!ok(numstat) || !ok(status) || !ok(patch)) return null
  const binary = new Set()
  for (const rec of String(numstat.stdout).split('\0')) {
    const m = /^(-|\d+)\t(-|\d+)\t(.+)$/.exec(rec)
    if (m && m[1] === '-') binary.add(m[3])
  }
  const st = String(status.stdout).split('\0')
  const added = new Map()
  let cur = null
  for (const line of String(patch.stdout).split('\n')) {
    if (line.startsWith('diff --git ')) cur = null
    else if (line.startsWith('+++ ')) cur = line === '+++ /dev/null' ? null : line.slice(6)
    else if (cur !== null && line.startsWith('+')) {
      if (!added.has(cur)) added.set(cur, [])
      added.get(cur).push(line.slice(1))
    }
  }
  const changes = []
  for (let i = 0; i + 1 < st.length; i += 2) {
    const [code, path] = [st[i], st[i + 1]]
    if (!code || !path) continue
    const shown = runGit(['cat-file', '-p', `${mainRef}:${path}`], repoRoot)
    let mainText
    if (ok(shown)) mainText = String(shown.stdout)
    else {
      const listed = runGit(['ls-tree', '--name-only', mainRef, '--', path], repoRoot)
      mainText = ok(listed) && !String(listed.stdout).trim() ? null : undefined
    }
    changes.push({ path, binary: binary.has(path), deleted: code === 'D', addedLines: added.get(path) ?? [], mainText })
  }
  return changes
}

/**
 * Judge every branch and (unless dry) delete the ones the rule frees.
 * `emit` writes manifest lines, `fail` records a failure kind. Returns the step result.
 */
export function runBranchesStep({ runGit, repoRoot, now, dryRun, workOrder, archiveText, worktreesText, emit, fail, contained }) {
  const held = checkedOutBranches(worktreesText)
  if (!held) {
    fail('branches-worktrees-unreadable', 'git worktree list unreadable; branches step skipped')
    return 'skipped'
  }
  const { local, origin } = listBranches(runGit, repoRoot)
  if (!local) fail('branches-local-unreadable', 'for-each-ref failed')
  if (!origin) fail('branches-origin-unreadable', 'ls-remote origin failed')
  const judge = contained ?? ((sha) => contentContained(branchChanges(runGit, repoRoot, sha)))
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
    const r = runGit(['update-ref', '-d', `refs/heads/${b.name}`, b.sha], repoRoot)
    if (!ok(r)) fail('branch-delete-failed', `${path}: ${String(r?.stderr || '').slice(0, 200)}`)
    emit({ path, size: 0, rule: v.rule, outcome: ok(r) ? 'deleted' : 'failed', reason: b.sha })
  }
  if (doomedOrigin.length) {
    const args = ['push', '--porcelain', 'origin']
    for (const b of doomedOrigin) args.push(`--force-with-lease=refs/heads/${b.name}:${b.sha}`)
    for (const b of doomedOrigin) args.push(`:refs/heads/${b.name}`)
    const r = runGit(args, repoRoot)
    // --porcelain marks each ref: '-' deleted, '!' rejected.
    const lines = String(r?.stdout ?? '').split('\n')
    for (const b of doomedOrigin) {
      const gone = lines.some((l) => l.startsWith('-\t') && l.includes(`refs/heads/${b.name}`))
      if (!gone) fail('branch-delete-failed', `${b.path}: push did not delete it`)
      emit({ path: b.path, size: 0, rule: b.rule, outcome: gone ? 'deleted' : 'failed', reason: b.sha })
    }
  }
  return local && origin ? (dryRun ? 'planned' : 'done') : 'partial'
}
