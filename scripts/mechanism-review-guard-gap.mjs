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
  const patch = run(['diff', range])
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
export async function assessReviewGap({ baseline, head }) {
  let measured = null
  let measurementError = ''
  try {
    measured = measureReviewMaterial({ baseline, head })
  } catch (e) {
    measurementError = (e && e.message) || 'measurement failed'
  }

  let planner = null
  if (measured) {
    try {
      const tool = await import('./review-material-core.mjs')
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
    } catch {
      planner = null // no splitting tool in this tree — the core rules on size alone
    }
  }

  const decision = decideReviewGap({
    measuredChars: measured?.measuredChars ?? null,
    budget: planner?.budget ?? REVIEW_GAP_BUDGET_CHARS,
    planner,
    measurementError,
  })
  return { ...decision, report: decision.gap ? formatReviewGap({ baseline, head, decision }) : '' }
}
