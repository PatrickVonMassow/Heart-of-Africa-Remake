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

/**
 * A step's runner may report this instead of true/false: the check could not
 * RUN (no network for the dependency audit), which is an environment fact and
 * not a statement about the code. Fail-soft on it — the house rule — but say so.
 */
export const UNAVAILABLE = 'unavailable'

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

/** The one load level on which a red is evidence on its own (point 296). */
export const QUIET = 'quiet'

/**
 * Normalise whatever the injected load reader hands back — a bare level string,
 * a `{ level, reasons }` object, nothing at all — into `{ level, why }`.
 *
 * A reader that throws or answers nonsense yields `unknown`, which is NOT quiet:
 * an unmeasured machine never certifies a red (the same rule machine-load-core
 * applies), and the cost of being wrong here is one extra run, never a waved-
 * through failure.
 */
export function normaliseLoad(value) {
  const raw = typeof value === 'string' ? { level: value } : (value ?? {})
  const level = typeof raw.level === 'string' && raw.level ? raw.level : 'unknown'
  // `why` is accepted as well as `reasons`, so normalising an already normalised
  // reading is a no-op — worseLoad does exactly that, and the reason must not be
  // lost on the way through it.
  const source = raw.reasons ?? raw.why ?? []
  const reasons = Array.isArray(source) ? source : [String(source)]
  return { level, why: reasons.filter(Boolean).join('; ') }
}

/**
 * Whether a red taken at this load level is evidence, or only a reading of the
 * machine (point 296/389).
 *
 * The asymmetry is the entire content: load produces false REDS and never false
 * greens. So a red on a QUIET machine blocks at once — no retry, no lowered bar —
 * and a red on a machine that is busy, loaded or unmeasured buys exactly ONE
 * second run. A step that fails twice blocks whatever the machine says.
 */
export function shouldRetryAfterRed(level) {
  return String(level ?? 'unknown') !== QUIET
}

/** Least to most alarming. Anything unmeasured outranks quiet — never below it. */
const LOAD_SEVERITY = { quiet: 0, unknown: 1, busy: 2, loaded: 3 }

/**
 * The less quiet of two readings — the answer to "the storm was over by the time
 * we looked".
 *
 * A load probe is a SNAPSHOT. A red produced while a neighbouring build ran can
 * be followed a second later by a quiet reading, and a gate that believed that
 * reading would block a red the load caused. So a reading taken BEFORE the long
 * steps is kept and the two are combined: a machine seen busy at either end was
 * not quiet while the step ran.
 */
export function worseLoad(a, b) {
  const rank = (x) => LOAD_SEVERITY[normaliseLoad(x).level] ?? LOAD_SEVERITY.unknown
  if (!a) return b ? normaliseLoad(b) : null
  if (!b) return normaliseLoad(a)
  return rank(a) >= rank(b) ? normaliseLoad(a) : normaliseLoad(b)
}

/**
 * Whether this plan is worth an opening load reading, taken before the first
 * step (point 389, measured).
 *
 * The probe costs ~2.6 s. `lint` runs in 0.5 s and `audit` in 1.6 s, so on the
 * light gate a pre-reading would more than DOUBLE a feature-branch push — while
 * a load spike that begins and ends inside a half-second lint run is not a thing
 * worth paying for. `build` and `unit` are the minute-long steps a whole storm
 * can hide inside, and there the same 2.6 s is noise. So the opening reading is
 * taken exactly where the blind spot exists.
 */
export const LONG_STEPS = ['build', 'unit']
export function needsOpeningLoadReading(steps) {
  return (Array.isArray(steps) ? steps : []).some((s) => LONG_STEPS.includes(s))
}

/** The line that makes the retry visible — a silent retry hides a real flake. */
export function retryNotice(step, { level, why } = {}) {
  const state = level === 'unknown' ? 'a machine whose quiet could not be verified' : `a machine that is ${level}`
  return (
    `pre-push gate: RETRY — ${step} was red on ${state}${why ? ` (${why})` : ''}.` +
    ' Re-running it ONCE: load produces false reds, never false greens (point 296).' +
    ' A second red blocks the push.'
  )
}

/** The line that closes a retry, so its OUTCOME is as visible as its start. */
export function retryOutcomeNotice(step, ok) {
  return ok
    ? `pre-push gate: ${step} passed on the re-run — the first red was the machine, not the code.`
    : `pre-push gate: ${step} failed AGAIN — this red is evidence, and it blocks.`
}

/**
 * Run the planned steps through an injected runner and stop at the first red —
 * the developer fixes that one anyway, and a full sweep would spend minutes
 * proving what is already decided. The runner is injected so this stays pure:
 * the wrapper passes a real spawn, the tests pass a synthetic failure. It is
 * called as `run(step, command, { attempt })`, so the wrapper can time and label
 * a second attempt without the core doing any I/O of its own.
 *
 * `readLoad` is the same seam for the machine. It is called with `{ when, step }`
 * — once as `start` where the plan contains a minute-long step (see
 * needsOpeningLoadReading), and again on every red — and the WORSE of the two
 * readings decides, so a lull after the storm cannot certify a red. On the light
 * gate no opening probe is paid at all, and no probe is ever taken on a green
 * push's short steps. `onNotice` prints — the retry must be visible.
 */
export function runGate(steps, run, { readLoad, onNotice } = {}) {
  const say = typeof onNotice === 'function' ? onNotice : () => {}
  const ask = (when, step) => {
    if (typeof readLoad !== 'function') return null
    try {
      return normaliseLoad(readLoad({ when, step }))
    } catch {
      // A load probe that dies says nothing about the machine; treat it as
      // unmeasured rather than as quiet, and pay one re-run for the doubt.
      return { level: 'unknown', why: 'the load probe failed' }
    }
  }
  const opening = needsOpeningLoadReading(steps) ? ask('start', null) : null
  const results = []
  for (const step of Array.isArray(steps) ? steps : []) {
    const outcome = run(step, GATE_COMMANDS[step], { attempt: 1 })
    // Three outcomes, not two: a step can also be UNAVAILABLE — it could not
    // run at all (an unreachable registry for the audit). That says nothing
    // about the code, so it neither passes nor blocks; it is reported and the
    // run continues. Anything else that is not literally `true` is a failure.
    if (outcome === UNAVAILABLE) {
      results.push({ step, ok: true, unavailable: true })
      continue
    }
    if (outcome === true) {
      results.push({ step, ok: true })
      continue
    }

    // Red. Was the machine quiet enough for that to mean anything? The reading
    // taken now is combined with the one from before the long steps.
    const load = worseLoad(opening, ask('red', step))
    if (!load || !shouldRetryAfterRed(load.level)) {
      results.push({ step, ok: false, ...(load ? { loadLevel: load.level } : {}) })
      break
    }

    say(retryNotice(step, load))
    const second = run(step, GATE_COMMANDS[step], { attempt: 2 })
    if (second === UNAVAILABLE) {
      say(retryOutcomeNotice(step, true))
      results.push({ step, ok: true, unavailable: true, retried: true, loadLevel: load.level })
      continue
    }
    const ok = second === true
    say(retryOutcomeNotice(step, ok))
    results.push({ step, ok, retried: true, loadLevel: load.level })
    if (!ok) break
  }
  return results
}

/** Whether the results block the push, what failed, what could not run, what was re-run. */
export function decide(results) {
  const list = Array.isArray(results) ? results : []
  const failed = list.filter((r) => r && r.ok === false).map((r) => r.step)
  const unavailable = list.filter((r) => r && r.unavailable).map((r) => r.step)
  const retried = list.filter((r) => r && r.retried).map((r) => r.step)
  return { blocked: failed.length > 0, failed, unavailable, retried }
}

/** The message the developer sees — it must say what to run, not only what broke. */
export function formatVerdict({ blocked, failed, unavailable = [], retried = [] }, { reason } = {}) {
  const note = unavailable.length ? ` — ${unavailable.join(', ')} could not run and was NOT checked` : ''
  // A retry stays in the verdict, not only in the scrollback: a green that only
  // came on a second run is a green with a question attached to it.
  const redo = retried.length ? ` — ${retried.join(', ')} was re-run once after a red taken under load` : ''
  if (!blocked) return `pre-push gate: green (${reason ?? 'gate passed'})${note}${redo}`
  // The bypass is documented in the hook's own comment and NOT advertised here:
  // most pushes in this repository are made by autonomous agents, and a failure
  // message that names its escape hatch invites the escape.
  const twice = (failed ?? []).filter((f) => retried.includes(f))
  return [
    `PUSH BLOCKED — the fast gate is red: ${failed.join(', ')}`,
    ...(twice.length ? [`${twice.join(', ')} failed TWICE — the load was not the cause.`] : []),
    'CI would fail on this state and mail the failure. Fix it, then push again.',
    `  ${failed.map((f) => (GATE_COMMANDS[f] ?? []).join(' ')).join('\n  ')}`,
  ].join('\n')
}
