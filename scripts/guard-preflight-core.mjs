// Pure core of the guard preflight (point 365 D, user 26.07.2026).
//
// WHY: a guard that blocks costs a whole turn at full context — the
// render-verify loop on point 278 cost about thirty such turns for one process
// mistake. Asking the guards BEFORE the action they govern costs one cheap
// process run instead.
//
// This module only orchestrates and formats. The inputs come from each guard
// WRAPPER's exported gather step and the verdict from its pure core (wired in
// scripts/guard-preflight.mjs): the gathering is where a reimplementation would
// drift and hand back a false "clean", so the preflight never writes its own.
//
// ADVISORY BY DESIGN: state changes between the preflight and the action, so the
// guard itself stays the authority. A clean preflight is a good sign, not a pass.
//
// ONE DENY THIS REPORT DOES NOT MODEL (point 434, 30.07.2026): the PreToolUse
// FENCE chokepoint in `board-first-guard.mjs`. It refuses merge/push, the TASKS.md
// tick and archive move, the board publish and `dashboard-state.json` to a session
// whose batch fence has been superseded — one that lost the batch while it was
// silent. This report can therefore read "clean" where that gate denies. It is not
// wired in because the answer is not a guard verdict but an ownership FACT, and its
// remedy is not "satisfy the gate" but `node scripts/batch-claim.mjs` or stop
// driving the batch — which the deny text says in full. Wire it here if a session
// is ever seen looping against it.

/** Statuses a guard can have in the report. */
export const STATUS = {
  block: 'would-block',
  clean: 'clean',
  skip: 'not-applicable',
  /**
   * The guard is registered and WIRED, and this report cannot say what it would
   * do — its verdict needs something a read-only preflight does not have (a
   * network round trip, the reply that is not written yet) or must not do
   * (acquire the batch lock). Deliberately distinct from `not-applicable`, which
   * means the guard genuinely does not govern this state: a reader who cannot
   * tell those apart reads silence as a clean bill, which is the whole defect
   * this report exists to end (point 437 E).
   */
  notJudged: 'not-judged',
  unknown: 'session-unknown',
  error: 'error',
}

/**
 * Why a guard stood down, when the caller has to treat the answer differently.
 * `not-lock-owner` is the one that matters: those guards key on the session id,
 * and without one `heldByOtherLiveOwner('')` treats the OWNING session as a
 * stranger — four guards then report "not-applicable" for the very session that
 * owns the batch. That is a false all-clear, so it is reported as UNKNOWN.
 */
export const CAUSE = { notLockOwner: 'not-lock-owner', notJudged: 'not-judged' }

/**
 * The Stop hooks a settings object wires, as preflight ids (the script base name
 * without `.mjs`, which is the id convention the registry uses).
 *
 * `.claude/settings.json` is the AUTHORITATIVE chain; the registry below is a
 * second list, and until point 437 nothing compared them. A hook outside the
 * registry reported nothing at all while it would block — and CLAUDE.md §7.2
 * tells the session to preflight and answer LAST, so a false clean reproduces
 * exactly the answer-twice loop the preflight exists to prevent.
 *
 * Total: anything unparseable yields an empty list, which reports no drift
 * rather than inventing one.
 */
export function wiredStopHookIds(settings) {
  try {
    const entries = settings?.hooks?.Stop
    if (!Array.isArray(entries)) return []
    const ids = []
    for (const entry of entries) {
      for (const hook of entry?.hooks ?? []) {
        const m = /scripts[\\/]([\w.-]+)\.mjs/.exec(String(hook?.command ?? ''))
        if (m && !ids.includes(m[1])) ids.push(m[1])
      }
    }
    return ids
  } catch {
    return []
  }
}

/** Wired Stop hooks that no registered guard covers — the drift, by name. */
export function unregisteredStopHooks(wiredIds = [], guards = []) {
  const known = new Set((guards ?? []).map((g) => g?.id))
  return (Array.isArray(wiredIds) ? wiredIds : []).filter((id) => !known.has(id))
}

/**
 * Which guards govern which action. `turn-end` is every guard (the Stop chain
 * runs them all); the narrower actions name the ones that realistically bite
 * there, so a preflight before a merge does not read like a full audit.
 */
export const ACTIONS = {
  'turn-end': null, // null = all registered guards
  // The closing reply is the LAST thing written (point 403): a guard that
  // blocks after it was composed forces a second message, and the user reads
  // the same answer twice. `--for answer` is therefore the whole chain under
  // the name of the moment it is asked at — before composing, not after.
  answer: null,
  merge: [
    'model-guard',
    'render-verify-guard',
    'mechanism-review-guard',
    'criticality-review-guard',
    'tasks-archive-guard',
    'doc-budget-guard',
  ],
  // The criticality gate belongs on BOTH: the tick is where it bites, and the
  // merge is the last moment where recording the second model's review is still
  // cheap — asked only at the tick, the answer arrives after the branch is gone.
  tick: [
    'tasks-archive-guard',
    'tasks-spec-guard',
    'queue-order-guard',
    'dashboard-guard',
    'criticality-review-guard',
  ],
  commit: ['model-guard', 'mechanism-review-guard', 'doc-budget-guard', 'tasks-spec-guard'],
  tag: [
    'model-guard',
    'render-verify-guard',
    'mechanism-review-guard',
    'criticality-review-guard',
    'tasks-archive-guard',
    'dashboard-guard',
    'doc-budget-guard',
  ],
}

/** Is this an action the map knows? (`turn-end` and friends.) */
export const isKnownAction = (action) => Object.hasOwn(ACTIONS, String(action))

/** The guards `action` governs, out of `guards`. An unknown action means all. */
export function selectGuards(guards, action = 'turn-end') {
  const ids = ACTIONS[action]
  if (!ids) return guards
  return guards.filter((g) => ids.includes(g.id))
}

/**
 * Normalise the verdict shapes the cores use — `{ block, reason }`,
 * `{ decision: 'block', reason }`, a list of offenders, a formatter's string —
 * into one { block, reason }. Unknown shapes count as CLEAN: a preflight that
 * invented a block would train its reader to ignore it.
 */
export function normaliseVerdict(verdict) {
  if (!verdict) return { block: false, reason: '' }
  if (typeof verdict === 'string') return { block: verdict.length > 0, reason: verdict }
  if (Array.isArray(verdict)) {
    return { block: verdict.length > 0, reason: verdict.length ? JSON.stringify(verdict) : '' }
  }
  const block = verdict.block === true || verdict.decision === 'block'
  return { block, reason: block ? String(verdict.reason ?? '(no reason given)') : '' }
}

/**
 * Run gather + decide per guard descriptor `{ id, gather, decide, why }`.
 * A guard that throws is reported as `error` and never takes the preflight down:
 * the tool exists to save turns, so it must not cost one itself.
 *
 * `sessionKnown: false` says the caller could not determine the session id. A
 * singleton stand-down is then not evidence of anything (see CAUSE) and is
 * reported as `session-unknown` rather than as a clean not-applicable.
 */
export function runPreflight(guards, { sessionId = '', sessionKnown = true } = {}) {
  const results = []
  for (const guard of guards) {
    try {
      const gathered = guard.gather({ sessionId }) ?? {}
      if (gathered.applicable === false) {
        const blind = !sessionKnown && gathered.cause === CAUSE.notLockOwner
        const unjudgeable = gathered.cause === CAUSE.notJudged
        results.push({
          id: guard.id,
          status: blind ? STATUS.unknown : unjudgeable ? STATUS.notJudged : STATUS.skip,
          reason: blind
            ? 'no session id available, so the batch lock cannot say whether THIS session owns it — ' +
              'the guard was not judged. Pass --session <id> to get a real answer.'
            : (gathered.why ?? 'stands down here'),
        })
        continue
      }
      const { block, reason } = normaliseVerdict(guard.decide(gathered.inputs ?? {}))
      results.push({ id: guard.id, status: block ? STATUS.block : STATUS.clean, reason })
    } catch (e) {
      results.push({ id: guard.id, status: STATUS.error, reason: (e && e.message) || String(e) })
    }
  }
  return results
}

/**
 * THE DIVERGENT-STEP QUESTION (point 541).
 *
 * `mechanism-review-guard` enforces the CONVERGENT half of the four-eyes
 * principle. The DIVERGENT half — a step that ENUMERATES (what could go wrong,
 * which cases to test, which designs are possible) must run BLIND PARALLEL, not
 * as a review of an already-finished list — can be enforced by nothing: whether
 * a step was divergent stands in no file, so no guard can even detect it.
 *
 * So the preflight ASKS. It is a question, never a verdict: a false block on a
 * judgement call costs a whole turn, and this report cannot know the answer. It
 * is printed apart from the guard lines for exactly that reason.
 */
export const DIVERGENT_STEP_QUESTION = Object.freeze([
  'FOUR-EYES, DIVERGENT HALF (advisory — no guard can check this, and none blocks on it):',
  '  Does this turn contain an ENUMERATING step — what could go wrong, which cases to test,',
  '  which designs are possible, where a system might break? Then it runs BLIND PARALLEL:',
  '  both models from the same inputs to their own complete result, neither seeing the',
  '  other\'s, then merged by MEANING (CLAUDE.md §6). A reviewer handed a finished list',
  '  checks THAT LIST — which is the failure the rule exists to prevent.',
  '  The MERGE goes to the model that wrote NEITHER list and is COUNTED, entry by entry:',
  '  blind-merge.mjs --a <A> --b <B> --union <U>. Record which form the verdict covers:',
  '  mechanism-review.mjs --record … --mode <review|blind-parallel> --merged-by "<model>".',
])

/** First line of a reason, shortened — the report is a scan, not a transcript. */
export function summarise(reason, maxChars = 220) {
  const first = String(reason ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!first) return ''
  return first.length > maxChars ? `${first.slice(0, maxChars - 1)}…` : first
}

/** One line per guard, plus the verdict and the advisory. */
export function formatPreflightReport(results, { action = 'turn-end', unregistered = [] } = {}) {
  const drift = Array.isArray(unregistered) ? unregistered : []
  const width = Math.max(0, ...results.map((r) => r.id.length))
  const lines = [`guard preflight — would a guard block "${action}" right now?`, '']
  for (const r of results) {
    const mark = {
      [STATUS.block]: '✗',
      [STATUS.clean]: '✓',
      [STATUS.skip]: '–',
      [STATUS.notJudged]: '?',
      [STATUS.unknown]: '?',
      [STATUS.error]: '!',
    }[r.status]
    lines.push(
      `  ${mark} ${r.id.padEnd(width)}  ${r.status}${r.reason ? `: ${summarise(r.reason)}` : ''}`,
    )
  }
  const blocking = results.filter((r) => r.status === STATUS.block)
  const unjudged = results.filter(
    (r) => r.status === STATUS.notJudged || r.status === STATUS.unknown || r.status === STATUS.error,
  )
  lines.push('')
  // THE SUMMARY MAY NOT READ CLEAN WHILE SOMETHING WENT UNJUDGED (point 437 E).
  // "No registered guard would block right now" was the sentence a session acted
  // on, and it was true of the guards this report could judge — which is not the
  // claim the reader took from it.
  if (blocking.length) {
    lines.push(`${blocking.length} guard(s) WOULD BLOCK: ${blocking.map((b) => b.id).join(', ')} — fix these first.`)
  } else if (unjudged.length || drift.length) {
    const parts = []
    if (unjudged.length) parts.push(`${unjudged.length} was/were NOT judged`)
    if (drift.length) parts.push(`${drift.length} wired Stop hook(s) are not registered here`)
    lines.push(
      `No guard this report could judge would block right now — but ${parts.join(' and ')}, ` +
        'so this is not an all-clear.',
    )
  } else {
    lines.push('No registered guard would block right now.')
  }
  for (const b of blocking) {
    lines.push('', `--- ${b.id} ---`, b.reason)
  }
  const errors = results.filter((r) => r.status === STATUS.error)
  if (errors.length) {
    lines.push('', `NOTE: ${errors.map((e) => e.id).join(', ')} could not be evaluated — treat as unknown.`)
  }
  const notJudged = results.filter((r) => r.status === STATUS.notJudged)
  if (notJudged.length) {
    lines.push(
      '',
      `NOTE: ${notJudged.map((r) => r.id).join(', ')} are wired and were NOT JUDGED here — their verdict ` +
        'needs something this read-only report does not have. They can still block.',
    )
  }
  const blind = results.filter((r) => r.status === STATUS.unknown)
  if (blind.length) {
    lines.push(
      '',
      `NOTE: ${blind.map((b) => b.id).join(', ')} went UNJUDGED because no session id was available — ` +
        'this report does not clear them. Re-run with --session <id>.',
    )
  }
  // The DRIFT, by name. A registry that covers only the guards someone
  // remembered to add reports nothing about the rest, and the next omission
  // would be as silent as the last one.
  if (drift.length) {
    lines.push(
      '',
      `DRIFT: these Stop hooks are wired in .claude/settings.json but registered with NO gather/decide ` +
        `pair here, so this report says nothing about them: ${drift.join(', ')}.`,
      'Register each in guard-preflight.mjs (GUARDS) — a gather that honestly reports "not judged" counts.',
    )
  }
  // Asked AFTER the verdict and outside the guard lines, so it can never be read
  // as one of them: it changes no status, no summary and no exit code.
  lines.push('', ...DIVERGENT_STEP_QUESTION)
  lines.push(
    '',
    'ADVISORY: the state can change between this report and the action, so each guard itself',
    'stays the authority.',
  )
  return lines.join('\n')
}
