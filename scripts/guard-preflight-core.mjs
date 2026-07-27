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

/** Statuses a guard can have in the report. */
export const STATUS = {
  block: 'would-block',
  clean: 'clean',
  skip: 'not-applicable',
  error: 'error',
}

/**
 * Which guards govern which action. `turn-end` is every guard (the Stop chain
 * runs them all); the narrower actions name the ones that realistically bite
 * there, so a preflight before a merge does not read like a full audit.
 */
export const ACTIONS = {
  'turn-end': null, // null = all registered guards
  merge: ['model-guard', 'render-verify-guard', 'tasks-archive-guard', 'doc-budget-guard'],
  tick: ['tasks-archive-guard', 'tasks-spec-guard', 'queue-order-guard', 'dashboard-guard'],
  commit: ['model-guard', 'doc-budget-guard', 'tasks-spec-guard'],
  tag: ['model-guard', 'render-verify-guard', 'tasks-archive-guard', 'dashboard-guard', 'doc-budget-guard'],
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
 */
export function runPreflight(guards, { sessionId = '' } = {}) {
  const results = []
  for (const guard of guards) {
    try {
      const gathered = guard.gather({ sessionId }) ?? {}
      if (gathered.applicable === false) {
        results.push({ id: guard.id, status: STATUS.skip, reason: gathered.why ?? 'stands down here' })
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
export function formatPreflightReport(results, { action = 'turn-end' } = {}) {
  const width = Math.max(0, ...results.map((r) => r.id.length))
  const lines = [`guard preflight — would a guard block "${action}" right now?`, '']
  for (const r of results) {
    const mark = { [STATUS.block]: '✗', [STATUS.clean]: '✓', [STATUS.skip]: '–', [STATUS.error]: '!' }[r.status]
    lines.push(
      `  ${mark} ${r.id.padEnd(width)}  ${r.status}${r.reason ? `: ${summarise(r.reason)}` : ''}`,
    )
  }
  const blocking = results.filter((r) => r.status === STATUS.block)
  lines.push('')
  lines.push(
    blocking.length
      ? `${blocking.length} guard(s) WOULD BLOCK: ${blocking.map((b) => b.id).join(', ')} — fix these first.`
      : 'No registered guard would block right now.',
  )
  for (const b of blocking) {
    lines.push('', `--- ${b.id} ---`, b.reason)
  }
  const errors = results.filter((r) => r.status === STATUS.error)
  if (errors.length) {
    lines.push('', `NOTE: ${errors.map((e) => e.id).join(', ')} could not be evaluated — treat as unknown.`)
  }
  lines.push(
    '',
    'ADVISORY: the state can change between this report and the action, so each guard itself',
    'stays the authority. Guards not listed here have no importable gather step yet.',
  )
  return lines.join('\n')
}
