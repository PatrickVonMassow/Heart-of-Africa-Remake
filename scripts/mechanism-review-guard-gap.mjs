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
import {
  decideReviewGap,
  estimateRenderedChars,
  formatReviewGap,
  REVIEW_GAP_BUDGET_CHARS,
} from './mechanism-review-guard-gap-core.mjs'

// The patch of a jammed range is megabytes by definition here — the default
// 1 MiB pipe would throw ENOBUFS and turn every measurement into 'unmeasured'.
const MAX_BUFFER = 512 * 1024 * 1024

// A read that OVERFLOWS the buffer is a MEASUREMENT (landing-round pass 3): it
// proves the output holds at least MAX_BUFFER bytes, hence at least this many
// characters (UTF-8 spends at most four bytes per character) — far past what
// any recordable split can carry, so the trap this file ends must not re-arm
// on the ranges big enough to need it most. The error is tagged, never
// swallowed: everything that is not the overflow still rethrows.
export const OVERSIZE_FLOOR_CHARS = Math.floor(MAX_BUFFER / 4)

// A blob whose size is beyond any pass's content room is never READ whole for
// a measurement — a stand-in string of the same planning consequence is fed to
// the splitter instead (see measureReviewMaterial). Well under MAX_BUFFER, so
// `git show` on a file this measurement does read cannot overflow.
const CONTENT_READ_LIMIT_BYTES = 8 * 1024 * 1024

const git = (args) => {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    })
  } catch (e) {
    if (e?.code === 'ENOBUFS' || /ENOBUFS/.test(String(e?.message ?? ''))) {
      const oversize = new Error(
        `git ${args[0]} output exceeded the ${MAX_BUFFER}-byte measurement buffer — at least ${OVERSIZE_FLOOR_CHARS} characters`,
      )
      oversize.oversize = true
      throw oversize
    }
    throw e
  }
}

/**
 * Assemble and measure the range's material. Character counts over the same
 * parts `review-sol` sends: the diffstat, the whole patch, and each touched
 * path's content at `head` (a path absent there — deleted — still counts its
 * patch, which the patch total already carries).
 */
export function measureReviewMaterial({ baseline, head, run = git }) {
  const range = `${baseline}..${head}`
  // AN OVERFLOW ON THE PATCH SIDE IS A PROVEN FLOOR, NOT A FAILURE (landing-
  // round pass 3): the stat, the patch and the path list describe the range
  // itself, so any of them past the buffer proves the material holds at least
  // the floor — the core rules on that without a plan, and the trap stays open.
  let stat
  let patch
  let paths
  try {
    stat = run(['diff', '--stat', range])
    // The same external-driver hardening as gatherRange (round-4 pass 7): the
    // measurement must weigh git's own patch, not a substituted one.
    patch = run(['diff', '--no-ext-diff', '--no-textconv', range])
    paths = run(['diff', '--name-only', '-z', range]).split('\0').filter(Boolean)
  } catch (e) {
    // Recognised on the ERROR ITSELF, not only on the internal helper's tag,
    // so an injected runner (the unit layer) and the real one rule alike.
    const oversize = e?.oversize || e?.code === 'ENOBUFS' || /ENOBUFS/.test(String(e?.message ?? ''))
    if (oversize) {
      return { measuredChars: OVERSIZE_FLOOR_CHARS, oversizeProven: true, stat: '', patch: '', files: [] }
    }
    throw e
  }
  const files = []
  let measuredChars = stat.length + patch.length
  for (const path of paths) {
    // THE BLOB'S SIZE IS ASKED BEFORE ITS BYTES (landing-round pass 3): `git
    // show` on a big-enough blob overflowed the buffer, ruled 'unmeasured'
    // and blocked forever. cat-file -s answers in a dozen characters; a blob
    // beyond the read limit is never read whole — its content could not
    // travel inside any pass anyway, only its patch could, so the splitter is
    // fed a STAND-IN whose only consulted property (its length forcing the
    // patch-only/uncoverable ruling) is the same, while the measured total
    // carries the conservative character floor of the real size.
    let sizeBytes = null
    try {
      sizeBytes = Number(run(['cat-file', '-s', `${head}:${path}`]).trim())
    } catch {
      // Absent at head (deleted) or unanswerable — the show below rules, with
      // its own absent-only tolerance.
      sizeBytes = null
    }
    let text = ''
    try {
      if (Number.isFinite(sizeBytes) && sizeBytes > CONTENT_READ_LIMIT_BYTES) {
        const floorChars = Math.floor(sizeBytes / 4)
        measuredChars += floorChars
        // Long enough that no pass room can hold it, short enough to cost
        // nothing: every planner decision over it is identical to the real
        // content's.
        files.push({ path, text: 'x'.repeat(Math.min(floorChars, 1_000_000)) })
        continue
      }
      text = run(['show', `${head}:${path}`])
    } catch (e) {
      // ONLY git's own "absent" may contribute nothing (final-round pass 3):
      // swallowing every failure let a crash or an overflowed buffer shrink
      // the measurement, and an over-budget range could then rule its own gap
      // over a PARTIAL reading. Anything else rethrows into the caller's
      // measurement catch, which rules 'unmeasured' — and blocks.
      if (!/does not exist|exists on disk, but not in/i.test(String(e?.message ?? ''))) throw e
    }
    measuredChars += text.length
    files.push({ path, text })
  }
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
  // A PROVEN OVERSIZE PLANS NOTHING: the parts were never read whole, so no
  // splitter can be consulted — the core rules on the floor alone.
  if (measured && !measured.oversizeProven) {
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
          // The tool's OWN fit ruling, which prices the delivery overhead the
          // raw sum omits (final-round pass 3).
          fits: plan.fits === true,
          // Covered means every pass of the plan fits AND nothing is beyond the
          // reach of any pass AND the diffstat is inside its share — the same
          // three claims planPasses itself makes for an assemblable split. AND
          // the split is RECORDABLE (landing-round pass 5): a plan of more
          // passes than MAX_PASS_TOTAL can never be recorded, so it covers
          // nothing — demanding it would re-arm the trap.
          covers:
            !plan.statTruncated &&
            (plan.uncoverable ?? []).length === 0 &&
            plan.passes.length >= 1 &&
            plan.passes.length <= (Number(tool.MAX_PASS_TOTAL) || 256),
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
    oversizeProven: Boolean(measured?.oversizeProven),
    // The no-splitter branch judges the RENDERED floor, not the raw sum
    // (landing-round pass 3) — delivery adds frames, headers and the receipt.
    renderedChars: measured
      ? estimateRenderedChars({
          measuredChars: measured.measuredChars,
          filePaths: (measured.files ?? []).map((f) => f.path),
        })
      : null,
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
