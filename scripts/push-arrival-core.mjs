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
 *   inFlight    a declared verification is running on this machine (or null when
 *               that could not be measured) — see THE CONFLICT below
 */
export function evaluatePushArrival(input) {
  // `= {}` would only cover undefined; the wrapper can hand us null on a git
  // failure, and a guard that throws is a guard that trapped the session.
  const { branch = '', ahead = null, hasUpstream = false, paused = false, inFlight = null } = input ?? {}
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
      'committed to, and git called that a success.' +
      conflictNote({ branch, push, inFlight }),
  }
}

/** The branch whose push runs the FULL gate — build, lint, audit and unit. Any
 *  other branch runs lint and audit only, which is seconds and no conflict. */
export const FULL_GATE_BRANCH = 'main'

/**
 * THE CONFLICT, stated where the demand arrives (08.09.2026). A push to `main`
 * runs the full pre-push gate — build, lint, audit, unit — on THIS machine, and
 * a picture run that is measuring at the same time is torn up by it: it happened
 * three times in one day, each time to a session that was obeying this very
 * rule. The exception was written down three times as well — in the
 * retrospective, in the beginner's guide and in a memory file — and never fired,
 * because all three copies sat under their TOPIC while the demand arrives HERE.
 * So it stands here now, and the sharper line is added when a declared run is
 * actually in flight.
 */
function conflictNote({ branch, push, inFlight }) {
  // Only the deployed branch carries the conflict — the four-eyes review caught
  // this generalising over every branch, and the gate itself says why: a feature
  // push runs lint and audit alone.
  if (branch !== FULL_GATE_BRANCH) return ''
  // The exception keeps the whole push command, remote and target included: the
  // incident this guard was built for was a push that went to the wrong place
  // and still reported success, and a bare `git push --no-verify` walks back
  // into exactly that.
  const exception =
    ` The gate's own visible exception is \`${push} --no-verify\` — and it obliges you to run the ` +
    'step your change touches by hand: "only documentation" is not safe by itself, because this ' +
    'repository holds unit tests OVER its documents (proved red on 08.09.2026).'
  if (inFlight) {
    return (
      ` A VERIFICATION IS IN FLIGHT (${inFlight}), and this push runs the full gate — build, lint, ` +
      'audit, unit — beside it. Prefer waiting for its receipt.' + exception
    )
  }
  return (
    ' If a picture run is measuring right now, this push runs the full gate beside it and can tear ' +
    'it up — defer the push until its receipt is in.' + exception
  )
}
