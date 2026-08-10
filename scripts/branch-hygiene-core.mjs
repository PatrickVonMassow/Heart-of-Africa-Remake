// A MERGED BRANCH MUST NOT SURVIVE ITS MERGE — the pure decision half
// (branch-hygiene-guard.mjs is the fail-open I/O wrapper).
//
// WHY: on 28.07.2026 the user reported 36 branches on GitHub. Measured that
// moment: 31 of the 36 remote branches were already fully contained in `main`,
// 72 of 77 local branches were, and 36 of 48 worktrees sat on such a branch —
// some 450 commits behind. Nothing was at risk (every commit lives in `main`),
// and all of it was noise: it hid the four genuinely open branches, made
// `git branch` useless as an overview, and the stale worktrees cost disk and
// confused every search. CLAUDE.md §6 already ends the branch workflow at the
// merge; the deletion was simply forgotten thirty-one times. A rule that is
// remembered is a rule that rots, so this is the backstop that notices.
//
// MERGE-TIME DELETION STAYS THE PRIMARY PATH. A backstop that fires routinely
// has become the process, which is how this debt accumulated in the first place.
//
// Pure and total: every input is plain data, so the Vitest layer
// (branch-hygiene-core.test.mjs) can sweep every branch without a git tree.

/** Grace after a branch last moved before its survival counts as debris.
 *  Wide enough that the session which just merged is never blocked by the
 *  branch it is still finishing with, short enough to catch the same turn's
 *  forgetfulness. Calibratable via HOA_BRANCH_GRACE_MIN. */
export const DEFAULT_GRACE_MS = 10 * 60 * 1000

/** Refs that are never debris, whatever `--merged` says about them. */
const PROTECTED_REFS = new Set(['main', 'origin/main', 'origin/head', 'head', '@'])

/** `refs/heads/x`, `heads/x` and `x@{0}` all name the same branch here. The
 *  remote prefix is deliberately KEPT (`origin/x` is a different object from
 *  the local `x` and needs its own deletion), so this only strips the
 *  spellings that mean the identical ref. */
export const normBranch = (r) =>
  String(r ?? '')
    .trim()
    .replace(/@\{[^}]*\}$/, '')
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\//, '')
    .replace(/^heads\//, '')
    .toLowerCase()

/** Filesystem paths compared the way Windows and git both will. */
export const normPath = (p) =>
  String(p ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()

/**
 * The worktree DIRECTORY a `worktree-agent-<id>` branch was created for, or
 * null for any other branch. `origin/` is stripped first: the remote twin of a
 * stub names the same tree.
 *
 * WHY (point 613): cutting an agent worktree also creates that setup branch,
 * and the agent switches to its own `feat/<point>-<slug>` within seconds. The
 * stub is then abandoned on the commit `main` had when the tree was cut — so
 * the moment `main` moves, containment says "already merged" and this guard
 * demanded its deletion on every turn of a healthy delegation. The existing
 * worktree protection missed it because the branch is genuinely checked out
 * NOWHERE; the tree it belongs to is identified by its NAME, not by its HEAD.
 * The stub is cleaned up where it is created (`scripts/worktree-cleanup.mjs`
 * removes it with the tree), so while the tree stands there is nothing to
 * report.
 */
export const stubBranchTree = (branch) => {
  const m = /^worktree-(agent-[a-z0-9][a-z0-9._-]*)$/.exec(normBranch(branch).replace(/^origin\//, ''))
  return m ? m[1] : null
}

/**
 * Is this worktree one of the verify-baseline checkouts? Those live under
 * `local/` and are CACHES keyed by sha — not branches, not agent debris, and
 * removing one only costs the next verification a re-checkout. They are carved
 * out by path rather than by state because that is what they are.
 */
export const isBaselineCheckout = (path, repoRoot) => {
  const p = normPath(path)
  const root = normPath(repoRoot)
  // Either spelling identifies them: under the main tree's `local/`, or by the
  // directory the verify runner puts them in. The second is the one that still
  // holds when the guard runs FROM a worktree, where its own root is not the
  // main tree's.
  return (root && p.startsWith(`${root}/local/`)) || p.includes('/local/verify-baseline/')
}

/**
 * THE DECISION. PURE.
 *
 * Inputs (all plain data):
 *   now             epoch ms
 *   repoRoot        the MAIN checkout's path (git's first worktree)
 *   ownPath         the checkout the guard itself runs from — often a worktree,
 *                   and it must never propose removing the tree it stands in
 *   graceMs         see DEFAULT_GRACE_MS
 *   readable        false when git could not be questioned → fail-open
 *   localMerged     [{ name, tipAt }]  local branches contained in origin/main
 *   remoteMerged    [{ name, tipAt }]  remote branches contained in origin/main
 *                                      (named as git prints them: `origin/x`)
 *   worktrees       [{ path, branch|null, locked, tipAt, mergedHead }]
 *                   every worktree git knows, `mergedHead` true when its HEAD
 *                   is contained in origin/main (so a DETACHED leftover counts
 *                   too — those were a third of the debris)
 *   inFlightBranches / inFlightPaths
 *                   what a LIVE session has declared it is still working on
 *
 * Returns { block, findings: [{ kind, name, ageMs, command }], reason }.
 *
 * WHY THE GRACE IS MEASURED ON THE TIP COMMIT: the moment a branch became
 * contained in main is not a thing git records cheaply, and this must stay a
 * two-command local probe. The tip date is the honest proxy for the case the
 * grace exists for — a session that just merged the branch it committed to
 * minutes ago — while the debris this fires on is hours to weeks old.
 */
export function assessBranchHygiene({
  now = Date.now(),
  repoRoot = '',
  ownPath = '',
  graceMs = DEFAULT_GRACE_MS,
  readable = true,
  localMerged = [],
  remoteMerged = [],
  worktrees = [],
  inFlightBranches = [],
  inFlightPaths = [],
  mainTip = null,
} = {}) {
  // FAIL-OPEN, as a decision rather than as luck: a git state nobody could read
  // is not evidence of debris, and a guard that blocks on its own blindness
  // traps the session.
  if (!readable) return { block: false, findings: [], reason: 'git-unreadable' }

  const heldBranches = new Set(inFlightBranches.map(normBranch).filter(Boolean))
  const heldPaths = new Set(inFlightPaths.map(normPath).filter(Boolean))
  const fresh = (tipAt) => typeof tipAt === 'number' && now - tipAt >= 0 && now - tipAt < graceMs
  const age = (tipAt) => (typeof tipAt === 'number' ? now - tipAt : null)

  // A BRANCH STANDING EXACTLY ON MAIN IS NOT DEBRIS — it was just cut (four-eyes
  // review of the arming, 30.07.2026). Containment says "merged" for a ref whose
  // tip EQUALS main's tip, and the grace period cannot save it: the grace is
  // measured on the TIP COMMIT's date, which for a branch with no commits of its
  // own is main's own history — already spent the moment the branch is born. The
  // guard would therefore demand the deletion of a feature branch, or the cleanup
  // of a live agent's worktree, in exactly the window between cutting it and its
  // first commit. The debris this guard was built for sat commits BEHIND main,
  // never on its tip.
  const tip = typeof mainTip === 'string' && mainTip.trim() ? mainTip.trim() : null
  const onMainTip = (sha) => tip !== null && typeof sha === 'string' && sha.trim() === tip

  const findings = []

  // A LIVING worktree protects its branch as well as itself. `locked` is git's
  // own marker for "an agent is using this tree"; the repo root is the session's
  // own checkout. Neither may be swept, and neither may their branches be —
  // git would refuse the branch deletion anyway, so a finding there is noise.
  const protectedByWorktree = new Set()
  const sweepable = []
  // Every worktree git knows, by DIRECTORY NAME. That name is the only thing
  // tying an abandoned setup branch to the tree it was cut for, since the stub
  // is checked out nowhere the moment the agent switches to its feat branch.
  const worktreeDirs = new Set()
  for (const wt of Array.isArray(worktrees) ? worktrees : []) {
    const path = normPath(wt?.path)
    if (!path) continue
    worktreeDirs.add(path.slice(path.lastIndexOf('/') + 1))
    const branch = normBranch(wt?.branch)
    const living =
      path === normPath(repoRoot) ||
      (ownPath && path === normPath(ownPath)) ||
      wt?.locked === true ||
      heldPaths.has(path) ||
      (branch && heldBranches.has(branch))
    if (living || isBaselineCheckout(path, repoRoot)) {
      if (branch) protectedByWorktree.add(branch)
      continue
    }
    sweepable.push(wt)
  }

  // A SETUP BRANCH IS PART OF ITS TREE, not debris beside it: while the tree
  // stands, `worktree-agent-<id>` is reported nowhere, and when the tree goes
  // the branch goes with it (worktree-cleanup.mjs). See stubBranchTree.
  const stubOfExistingTree = (name) => {
    const dir = stubBranchTree(name)
    return dir !== null && worktreeDirs.has(dir)
  }

  // 1. WORKTREES first: the branch inside one cannot be deleted while the tree
  //    stands, so the remedy has to read in this order.
  for (const wt of sweepable) {
    const branch = normBranch(wt?.branch)
    const merged = branch ? isMergedLocal(branch, localMerged) : wt?.mergedHead === true
    if (!merged) continue
    if (fresh(wt?.tipAt) || onMainTip(wt?.tipSha)) continue
    findings.push({
      kind: 'worktree',
      name: String(wt.path),
      ageMs: age(wt?.tipAt),
      command: `node scripts/worktree-cleanup.mjs "${wt.path}"`,
    })
  }

  // 2. LOCAL branches.
  for (const b of Array.isArray(localMerged) ? localMerged : []) {
    const name = normBranch(b?.name)
    if (!name || PROTECTED_REFS.has(name)) continue
    if (heldBranches.has(name) || protectedByWorktree.has(name) || stubOfExistingTree(name)) continue
    if (fresh(b?.tipAt) || onMainTip(b?.tipSha)) continue
    findings.push({
      kind: 'local',
      name: String(b.name),
      ageMs: age(b?.tipAt),
      command: `git branch -d ${b.name}`,
    })
  }

  // 3. REMOTE branches. `origin/board` is the progress board's publishing lane
  //    and carries its own commit, so it is NOT contained in main and never
  //    reaches this loop — no special case is needed for it, and that is the
  //    point: the containment test is the rule, not a name list.
  for (const b of Array.isArray(remoteMerged) ? remoteMerged : []) {
    const name = normBranch(b?.name)
    if (!name || PROTECTED_REFS.has(name)) continue
    const bare = name.replace(/^origin\//, '')
    if (heldBranches.has(bare) || heldBranches.has(name) || protectedByWorktree.has(bare) || stubOfExistingTree(bare))
      continue
    // The same exemption the local loop carries, and for the same branch: the
    // workflow pushes a feature branch the moment it is cut, for durability, so
    // between the cut and the first commit the REMOTE ref stands on main's tip
    // too — and the grace cannot save it, because a branch with no commits of
    // its own is dated by main's history (four-eyes review 30.07.2026).
    if (fresh(b?.tipAt) || onMainTip(b?.tipSha)) continue
    findings.push({
      kind: 'remote',
      name: String(b.name),
      ageMs: age(b?.tipAt),
      command: `git push origin --delete ${bare}`,
    })
  }

  return {
    block: findings.length > 0,
    findings,
    reason: findings.length > 0 ? 'merged-branches-survive' : 'clean',
  }
}

const isMergedLocal = (branch, localMerged) =>
  (Array.isArray(localMerged) ? localMerged : []).some((b) => normBranch(b?.name) === branch)

/** Render the findings as the Stop hook's block message. */
export function formatBranchHygiene(findings, { limit = 12 } = {}) {
  if (!findings?.length) return ''
  const mins = (ms) => (typeof ms === 'number' ? `${Math.round(ms / 60000)} min alt` : 'Alter unbekannt')
  const shown = findings.slice(0, limit)
  const rest = findings.length - shown.length
  return [
    `ZWEIG-HYGIENE: ${findings.length} bereits in origin/main enthaltene(r) Rest(e) lebt/leben noch.`,
    'CLAUDE.md §6: der Zweig-Ablauf ENDET beim Merge — Zweig, Remote-Zweig und Worktree gehen mit.',
    ...shown.map((f) => `  · [${f.kind}] ${f.name} (${mins(f.ageMs)})  →  ${f.command}`),
    ...(rest > 0 ? [`  … und ${rest} weitere.`] : []),
    '',
    'Aufräumen und den Zug beenden. Prüfen mit: node scripts/branch-hygiene-guard.mjs --status',
  ].join('\n')
}
