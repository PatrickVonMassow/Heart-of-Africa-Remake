// Pure decision core of the push-arrival guard (rule audit 25.07.2026, priority
// 1 of the mechanisms worth building). The night of 24./25.07 produced thirteen
// commits — the degraded-session repair, the model tripwire, every queued point
// — that sat ONLY on a local feature branch: the session stood on
// `feat/302-…`, committed there, and pushed with `git push origin main`, which
// transfers the LOCAL, unchanged main. Git reports that as success
// ("Everything up-to-date"); nothing warns. It surfaced by chance a day later.
//
// The lesson (retrospective §3.18): a tool's success message proves the tool
// ran, not that the intended thing happened. So this guard judges the OBSERVED
// TARGET STATE — is the current HEAD actually contained in a remote ref? —
// rather than any command's exit code.
//
// Side-effect free; the wrapper (push-arrival-guard.mjs) gathers the git facts
// and is fail-open.

/**
 * Decide whether the turn may end, given how many commits sit ahead of the
 * remote and whether the working tree still has changes.
 *
 * Inputs (all optional; missing data errs toward ALLOW, since the wrapper's
 * fail-open contract must not turn a git hiccup into a trapped session):
 *   branch      current branch name ('' when detached)
 *   ahead       commits on HEAD not contained in ANY remote ref (null: unknown)
 *   hasUpstream whether the branch tracks a remote branch at all
 *   paused      .claude/batch-paused exists → no batch duty in flight
 */
export function evaluatePushArrival(input) {
  // `= {}` would only cover undefined; the wrapper can hand us null on a git
  // failure, and a guard that throws is a guard that trapped the session.
  const { branch = '', ahead = null, hasUpstream = false, paused = false } = input ?? {}
  if (paused) return null
  if (ahead === null || !Number.isFinite(ahead)) return null // unknown → allow
  if (ahead <= 0) return null

  const where = branch ? `\`${branch}\`` : 'the detached HEAD'
  const push = branch ? `git push -u origin ${branch}` : 'git push origin HEAD:<branch>'
  return {
    decision: 'block',
    reason:
      `UNPUSHED WORK: ${ahead} commit(s) on ${where} exist in NO remote ref` +
      (hasUpstream ? '' : ' (the branch tracks no remote at all)') +
      '. The project rule is to push after EVERY commit, so nothing is lost when a session dies. ' +
      `Run: ${push} — then PROVE it arrived with \`git rev-list --count @{u}..HEAD\` (must be 0). ` +
      'A push that prints "Everything up-to-date" is NOT proof: on 24.07.2026 thirteen commits sat ' +
      'local for a whole night because the session pushed a different branch than the one it had ' +
      'committed to, and git called that a success.',
  }
}
