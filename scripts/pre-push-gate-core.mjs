// Pure decision logic of the pre-push gate (point 302): which checks a push
// must survive before it may reach the remote, and whether a set of results
// blocks it. The wrapper (pre-push-gate.mjs) does the git/npm I/O.
//
// The rule this enforces: CI must never be the first thing to notice a broken
// state. A red run emails the user, and "it went green after I fixed it" does
// not unsend that mail.
//
// This core FAILS CLOSED on a real finding — that is its whole purpose — while
// the wrapper stays fail-open on its own internal errors, like every other
// guard here.

/** The full gate: exactly what CI runs on a push. */
export const FULL_GATE = ['build', 'lint', 'audit', 'unit']

/** The light gate. audit ALWAYS runs — a new CVE is the usual surprise. */
export const LIGHT_GATE = ['lint', 'audit']

/** The branch whose red runs reach the user as mail, and which is deployed. */
export const PROTECTED_REF = 'refs/heads/main'

/** How each step is run, so the wrapper never invents a command of its own. */
export const GATE_COMMANDS = {
  build: ['npm', 'run', 'build'],
  lint: ['npm', 'run', 'lint'],
  audit: ['node', 'scripts/audit-check.mjs'],
  unit: ['npm', 'run', 'test:unit'],
}

/**
 * Paths that cannot change what any gate step measures.
 *
 * This list is deliberately TINY, and the second review is why: the documents
 * that look most like prose are exactly the ones this repository measures.
 * `TASKS.md` and `docs/tasks-archive.md` are read by the archive-guard tests,
 * `CLAUDE.md` and `design.md` by the brief and design-section tests,
 * `docs/graphics-detail-levels.md` by the quality-preset sync test. A fast path
 * that waved those through would have been green locally and red in CI — the
 * exact failure the gate exists to prevent, on its own flagship case.
 *
 * So only what NO test can read qualifies: the git-ignored board and the
 * screenshot corpus.
 */
export function isProseOnlyPath(path) {
  const p = String(path ?? '').replace(/\\/g, '/')
  if (!p) return false
  if (p.startsWith('.batch-dashboard')) return true
  return p.startsWith('verification/')
}

/**
 * The plan for one pushed ref.
 *
 * A feature branch gets the LIGHT gate on purpose: agents commit and push per
 * step, and a full gate on every intermediate commit would cost more working
 * time than the branch's own red run costs. `main` — the deployed branch, and
 * the one whose failures mail the user — always gets what CI runs.
 */
export function gatePlan({ remoteRef, files, deleting = false } = {}) {
  if (deleting) return { steps: [], reason: 'branch deletion — nothing to check' }
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  if (remoteRef !== PROTECTED_REF) {
    return { steps: LIGHT_GATE, reason: `not ${PROTECTED_REF} — lint and audit only` }
  }
  if (list.length && list.every(isProseOnlyPath)) {
    return { steps: LIGHT_GATE, reason: 'prose and board only — no step can measure a difference' }
  }
  return { steps: FULL_GATE, reason: 'push to the deployed branch' }
}

/** The plan for a whole push: the widest plan any of its refs demands. */
export function gatePlanForPush(refs) {
  const plans = (Array.isArray(refs) ? refs : []).map((r) => gatePlan(r))
  const widest = plans.reduce((best, p) => (p.steps.length > (best?.steps.length ?? -1) ? p : best), null)
  return widest ?? { steps: [], reason: 'nothing to push' }
}

/**
 * Parse git's pre-push stdin: `<localRef> <localSha> <remoteRef> <remoteSha>`
 * per line. A local sha of all zeros means the ref is being DELETED.
 */
export function parsePushInput(text) {
  const ZERO = /^0+$/
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [localRef, localSha, remoteRef, remoteSha] = l.split(/\s+/)
      return { localRef, localSha, remoteRef, remoteSha, deleting: ZERO.test(localSha ?? '') }
    })
    .filter((r) => r.remoteRef)
}

/**
 * Run the planned steps through an injected runner and stop at the first red —
 * the developer fixes that one anyway, and a full sweep would spend minutes
 * proving what is already decided. The runner is injected so this stays pure:
 * the wrapper passes a real spawn, the tests pass a synthetic failure.
 */
export function runGate(steps, run) {
  const results = []
  for (const step of Array.isArray(steps) ? steps : []) {
    const ok = run(step, GATE_COMMANDS[step]) === true
    results.push({ step, ok })
    if (!ok) break
  }
  return results
}

/** Whether the results block the push, and what failed. */
export function decide(results) {
  const list = Array.isArray(results) ? results : []
  const failed = list.filter((r) => r && r.ok === false).map((r) => r.step)
  return { blocked: failed.length > 0, failed }
}

/** The message the developer sees — it must say what to run, not only what broke. */
export function formatVerdict({ blocked, failed }, { reason } = {}) {
  if (!blocked) return `pre-push gate: green (${reason ?? 'gate passed'})`
  // The bypass is documented in the hook's own comment and NOT advertised here:
  // most pushes in this repository are made by autonomous agents, and a failure
  // message that names its escape hatch invites the escape.
  return [
    `PUSH BLOCKED — the fast gate is red: ${failed.join(', ')}`,
    'CI would fail on this state and mail the failure. Fix it, then push again.',
    `  ${failed.map((f) => (GATE_COMMANDS[f] ?? []).join(' ')).join('\n  ')}`,
  ].join('\n')
}
