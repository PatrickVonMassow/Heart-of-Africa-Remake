// THE REVIEW-GAP MEASUREMENT (point 714) — the impure half of the ruling whose
// wording lives in mechanism-review-guard-gap-core.mjs.
//
// Called by mechanism-review-guard.mjs ONLY on a turn it would block: it
// assembles the same shape of material `review-sol` would send for the range
// (diffstat + patch + every touched path's content at head), measures it
// against the budget, asks the pass-splitting tool — where this tree carries
// one — whether a split covers the range, and hands the numbers to the pure
// ruling. The common clear turn never reaches this file.
//
// Self-contained by design: the splitting tool (review-material-core.mjs) is
// consulted through a dynamic import that tolerates its absence, because this
// clause is cherry-picked AHEAD of the tool onto trees the trap is live on.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** The one module whose ABSENCE (never a transitive import's) may rule
 *  'no-splitter' — spelled exactly as Node names it in ERR_MODULE_NOT_FOUND,
 *  as URL and (where this module runs from a file: URL) as path. Exported so
 *  the tests build their absence fakes from the same spellings. */
export const SPLITTER_SPELLINGS = Object.freeze(
  (() => {
    const url = new URL('./review-material-core.mjs', import.meta.url)
    const spellings = [url.href]
    try {
      spellings.push(fileURLToPath(url))
    } catch {
      /* not a file: URL (a bundler/test transform) — the href spelling stands */
    }
    return spellings
  })(),
)
import { REPO_ROOT } from './repo-paths.mjs'
import { decideReviewGap, formatReviewGap, REVIEW_GAP_BUDGET_CHARS } from './mechanism-review-guard-gap-core.mjs'

// The patch of a jammed range is megabytes by definition here — the default
// 1 MiB pipe would throw ENOBUFS and turn every measurement into 'unmeasured'.
const MAX_BUFFER = 512 * 1024 * 1024

const git = (args) =>
  execFileSync('git', args, {
    cwd: REPO_ROOT,
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  })

/**
 * Assemble and measure the range's material. Character counts over the same
 * parts `review-sol` sends: the diffstat, the whole patch, and each touched
 * path's content at `head` (a path absent there — deleted — still counts its
 * patch, which the patch total already carries).
 */
export function measureReviewMaterial({ baseline, head, run = git }) {
  const range = `${baseline}..${head}`
  const stat = run(['diff', '--stat', range])
  // The same external-driver hardening as gatherRange (round-4 pass 7): the
  // measurement must weigh git's own patch, not a substituted one.
  const patch = run(['diff', '--no-ext-diff', '--no-textconv', range])
  const paths = run(['diff', '--name-only', '-z', range]).split('\0').filter(Boolean)
  const files = []
  for (const path of paths) {
    let text = ''
    try {
      text = run(['show', `${head}:${path}`])
    } catch {
      /* deleted at head, or unreadable as text — it contributes no content */
    }
    files.push({ path, text })
  }
  let measuredChars = stat.length + patch.length
  for (const f of files) measuredChars += f.text.length
  return { measuredChars, stat, patch, files }
}

/**
 * The full ruling for one range: measure, consult the splitter where present,
 * decide, and format the report the guard prints while the gap holds.
 * NEVER throws: a failure inside rules 'unmeasured', which keeps the gate
 * blocking — it does not assume the material fit, and it does not waive.
 */
export async function assessReviewGap({
  baseline,
  head,
  standingRecords = 0,
  // Injectable for the unit layer only — production callers pass neither.
  run = git,
  loadTool = () => import('./review-material-core.mjs'),
}) {
  let measured = null
  let measurementError = ''
  try {
    measured = measureReviewMaterial({ baseline, head, run })
  } catch (e) {
    measurementError = (e && e.message) || 'measurement failed'
  }

  let planner = null
  if (measured) {
    // The splitter's ABSENCE and its FAILURE are opposite rulings (round-2
    // pass 2): a tree without the tool genuinely cannot produce passes, so the
    // core may rule 'no-splitter' on size alone — but a tool that exists and
    // CRASHED leaves "would a split cover it?" unanswered, and answering
    // 'no-splitter' there waives the gate on an assessment failure. The import
    // is probed apart from the planning so the two cannot be conflated; any
    // failure past a successful import rules 'unmeasured', which blocks.
    let tool = null
    try {
      tool = await loadTool()
    } catch (e) {
      // ERR_MODULE_NOT_FOUND alone is AMBIGUOUS (round-3 pass 2): Node raises
      // the same code when the splitter exists but one of its own imports is
      // missing — a broken tool, not an absent one. Only a failure that names
      // THE SPLITTER ITSELF as the module it cannot find proves the cherry-pick
      // tree without the tool; everything else is an assessment failure, which
      // blocks.
      const missing = /Cannot find (?:module|package) '([^']+)'/.exec(String(e?.message ?? ''))?.[1] ?? ''
      // THE EXACT SIBLING, not a basename (round-4 pass 2): a missing
      // transitive module that happens to be NAMED review-material-core.mjs
      // elsewhere in the tree must not read as the splitter's absence.
      const toolAbsent = e?.code === 'ERR_MODULE_NOT_FOUND' && SPLITTER_SPELLINGS.includes(missing)
      if (!toolAbsent) {
        measurementError = `the splitting tool exists but could not load: ${(e && e.message) || e}`
      }
    }
    if (tool) {
      try {
        const plan = tool.planPasses({
          stat: measured.stat,
          patch: measured.patch,
          files: measured.files,
          budget: tool.MATERIAL_BUDGET_CHARS,
        })
        planner = {
          available: true,
          // Covered means every pass of the plan fits AND nothing is beyond the
          // reach of any pass AND the diffstat is inside its share — the same
          // three claims planPasses itself makes for an assemblable split.
          covers: !plan.statTruncated && (plan.uncoverable ?? []).length === 0 && plan.passes.length >= 1,
          uncoverable: (plan.uncoverable ?? []).map((u) => u.path),
          budget: tool.MATERIAL_BUDGET_CHARS,
        }
      } catch (e) {
        measurementError = `the pass planner failed: ${(e && e.message) || e}`
      }
    }
  }

  const decision = decideReviewGap({
    measuredChars: measured?.measuredChars ?? null,
    budget: planner?.budget ?? REVIEW_GAP_BUDGET_CHARS,
    planner,
    measurementError,
  })
  return {
    ...decision,
    report: decision.gap ? formatReviewGap({ baseline, head, decision, standingRecords }) : '',
  }
}

/**
 * The criticality mirror (the second door of the 18.08.2026 trap): rule on the
 * gate's blocking findings as a whole. Non-null ONLY when every finding is
 * record-backed (criticalityGapPlan) AND every record's own commit range —
 * `sha^..sha`, the material a re-review of that point's work needs — rules a
 * gap. Any finding that keeps the demand producible, any measurement that
 * fails, and any sha whose parent cannot be resolved leaves the block
 * standing: null here means "block as before".
 */
export async function assessCriticalityGap(findings = [], opts = {}) {
  const { criticalityGapPlan, formatCriticalityGap } = await import(
    './mechanism-review-guard-gap-core.mjs'
  )
  const plan = criticalityGapPlan(findings)
  if (!plan) return null
  const entries = []
  for (const e of plan) {
    const decision = await assessReviewGap({ baseline: `${e.sha}^`, head: e.sha, ...opts })
    if (!decision.gap) return null
    entries.push({ ...e, decision })
  }
  return { gap: true, entries, report: formatCriticalityGap(entries) }
}
