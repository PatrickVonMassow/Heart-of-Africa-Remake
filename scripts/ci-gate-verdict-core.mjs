// Pure decision logic of the CI gate verdict step (point 513, user decision
// 05.08.2026). The wrapper (ci-gate-verdict.mjs) does the GitHub I/O — writing
// the run summary, the annotations, the step outputs and the commit status.
//
// WHY THIS EXISTS. Two deliberate rules of this project worked against each
// other: a branch push runs the LIGHT local gate (lint + audit — the full gate
// per intermediate commit costs more working time than a red branch is worth,
// `pre-push-gate-core.mjs`), while CI runs the FULL gate on every branch push.
// An agent that commits mid-work therefore produced red runs, and GitHub mails
// the repository owner for every failed run he triggered. There is NO
// repository-side switch for that mail: it follows the run's CONCLUSION, so the
// only way to stop it is that a routine branch run never concludes in failure.
//
// Hence the split this module decides: on a `feat/**` PUSH every step of the job
// is `continue-on-error`, the run concludes green, and the true result is
// carried by the run summary, the `::error` annotations, the commit status on
// the pushed sha and the ntfy alert. On `main` — the deployed branch — nothing
// changes: the steps stay hard, the run goes red, and the mail goes out.
//
// Never throws: a verdict that crashed would fail the very step whose whole
// purpose is that nothing fails, so every entry point is total (`fail-open` in
// the direction of "report less", never "fail the job").

import { PROTECTED_REF } from './pre-push-gate-core.mjs'

/** Only a PUSH is routine. A manual dispatch or a PR is a deliberate ask and
 *  keeps the honest red — nobody runs those by accident mid-work. */
export const SOFT_EVENT = 'push'

/** The per-point feature branches of CLAUDE.md §6, and nothing else. */
export const SOFT_REF_PREFIX = 'refs/heads/feat/'

/** The step outcomes GitHub reports. `''` means the step has no id or never
 *  reported — treated as "did not run", which is not a failure. */
export const NOT_RUN = 'not-run'

/**
 * A step outcome that means the GATE said no. `cancelled` is deliberately NOT
 * one: this workflow cancels its own in-progress runs (`cancel-in-progress`), so
 * a cancelled step is a superseded run, not a broken tree.
 */
const FAILED_OUTCOMES = new Set(['failure'])

/** Is this the routine branch run whose red must not reach the owner's inbox? */
export function isSoftRun({ event, ref } = {}) {
  try {
    return String(event ?? '') === SOFT_EVENT && String(ref ?? '').startsWith(SOFT_REF_PREFIX)
  } catch {
    return false
  }
}

/** Does a failure of this run still mail the owner? True for `main` and for
 *  every non-routine trigger — that is point 2 of the decision, stated once. */
export function mailsOnFailure({ event, ref } = {}) {
  return !isSoftRun({ event, ref })
}

/**
 * Parse the workflow's `GATE_OUTCOMES` — `"build=success lint=failure …"`, the
 * shape the step composes from `steps.<id>.outcome`. Order is preserved, so the
 * report reads in the order the gate ran.
 */
export function parseOutcomes(text) {
  const out = []
  try {
    for (const token of String(text ?? '').split(/\s+/)) {
      if (!token) continue
      const at = token.indexOf('=')
      if (at <= 0) continue
      const step = token.slice(0, at)
      const outcome = token.slice(at + 1) || NOT_RUN
      out.push({ step, outcome })
    }
  } catch {
    return []
  }
  return out
}

/**
 * The whole verdict for one run.
 * @returns {{soft:boolean, mails:boolean, failed:string[], failedSteps:string,
 *            ok:boolean, ref:string, outcomes:{step:string,outcome:string}[]}}
 */
export function verdict({ event, ref, outcomes } = {}) {
  const list = Array.isArray(outcomes) ? outcomes : parseOutcomes(outcomes)
  const failed = list.filter((o) => FAILED_OUTCOMES.has(String(o?.outcome ?? ''))).map((o) => String(o.step))
  const soft = isSoftRun({ event, ref })
  return {
    ref: String(ref ?? ''),
    protectedRef: String(ref ?? '') === PROTECTED_REF,
    soft,
    mails: !soft && failed.length > 0,
    failed,
    failedSteps: failed.join(', '),
    ok: failed.length === 0,
    outcomes: list,
  }
}

/** The workflow-command annotations. A failed step gets its own line so the run
 *  page shows the finding beside the log, not only in the summary. */
export function annotations(v) {
  try {
    if (!v || v.ok) return []
    const where = v.soft ? 'branch gate' : 'gate'
    return v.failed.map((step) => `::error title=CI ${where} failed::${step} failed on ${v.ref}`)
  } catch {
    return []
  }
}

/**
 * The run summary. On a soft run this is the loudest thing GitHub shows, so it
 * says in words that the green tick is NOT a green gate — the confusion point 4
 * of the decision exists to prevent.
 */
export function renderSummary(v, { runUrl = '' } = {}) {
  try {
    if (!v) return ''
    const lines = []
    if (v.ok) {
      lines.push('## CI gate: PASSED', '')
    } else if (v.soft) {
      lines.push(
        '## CI gate: FAILED — and this run still concludes GREEN',
        '',
        `Failed: **${v.failedSteps}**`,
        '',
        'This is a routine `feat/**` push. Its run deliberately cannot conclude in',
        'failure, because a failed run mails the repository owner and a red branch is',
        'expressly normal here. The failure above is real: fix it before the merge.',
        'The alert went to the ntfy topic, and the commit carries a red status.',
        '',
      )
    } else {
      lines.push('## CI gate: FAILED', '', `Failed: **${v.failedSteps}**`, '')
    }
    for (const o of v.outcomes) lines.push(`- \`${o.step}\`: ${o.outcome}`)
    if (runUrl) lines.push('', runUrl)
    return lines.join('\n')
  } catch {
    return ''
  }
}

/**
 * The commit status posted on a SOFT run — the part of "the result stays
 * visible" that a green run conclusion cannot carry: a red ✗ beside the commit
 * in GitHub's UI and one API field for anything that asks later. Commit statuses
 * notify nobody, which is exactly why they are usable here.
 *
 * Returns null when nothing should be posted (a hard run reports itself through
 * its own conclusion).
 */
export function commitStatus(v, { runUrl = '' } = {}) {
  try {
    if (!v || !v.soft) return null
    return {
      state: v.ok ? 'success' : 'failure',
      context: 'ci/gate (branch)',
      target_url: runUrl,
      description: v.ok ? 'gate passed' : `gate failed: ${v.failedSteps}`.slice(0, 140),
    }
  } catch {
    return null
  }
}

/** The `$GITHUB_OUTPUT` lines the following steps key off. */
export function stepOutputs(v) {
  try {
    if (!v) return []
    return [`failed=${v.ok ? 'false' : 'true'}`, `failedSteps=${v.failedSteps}`, `mails=${v.mails ? 'true' : 'false'}`]
  } catch {
    return []
  }
}
