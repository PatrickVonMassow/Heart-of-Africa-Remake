// Stop hook: GUARANTEE the retrospective document
// (docs/analysis_de/retrospektive-zusammenarbeit.md) stays current — enforcement, not a
// reminder (the document's own lesson #1: only blocking mechanisms hold).
//
// It recomputes the fingerprint over the durable problem/solution-history
// sources (retro-sources.mjs) and BLOCKS turn-end while the doc's recorded
// fingerprint differs — a new/edited feedback memory, a new guard script, a
// fresh revert or a process TASKS change then forces
// `node scripts/retro-refresh.mjs` plus a review for a new problem class
// before the turn can end. The decision logic lives in retro-core.mjs (pure,
// Vitest-covered in retro-core.test.mjs).
//
// No-ops (exit 0, never block): the doc is absent (nothing to keep current —
// e.g. a worktree or another machine), the batch is paused, or this session
// does not own the live batch lock (ownership-aware like every guard since
// the hard singleton). Fail-OPEN: any internal error — unreadable stdin, a
// git failure, a broken memory dir — allows the stop; this guard must never
// trap the session.
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { computeFingerprint, evaluateCurrency, evaluateLedger } from './retro-core.mjs'
import { collectSources, DOC_PATH, GUIDE_PATH, LEDGER_PATH, REPO_ROOT } from './retro-sources.mjs'
import { CAUSE } from './guard-preflight-core.mjs'

const PAUSE = resolve(REPO_ROOT, '.claude', 'batch-paused')

/** A ledger cell's file reference, resolved against the repo root. Absolute or
 *  escaping paths are refused rather than probed. */
const pathExists = (rel) =>
  !isAbsolute(rel) && !rel.split('/').includes('..') && existsSync(resolve(REPO_ROOT, rel))

/**
 * Everything both checks need — exported so the guard preflight predicts this
 * gate from the SAME gathering the Stop hook uses rather than a second copy.
 *
 * `currentFingerprint` is null when the sources could not be collected at all,
 * which is the NORMAL state in a git worktree (the memory dir is keyed on the
 * checkout path and `collectSources()` throws there). Null skips the currency
 * half and leaves the ledger half — the split the wrapper's two try blocks
 * already made, hoisted here so both callers get it.
 */
export function gatherRetroCurrencyInputs({ sessionId = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (!existsSync(DOC_PATH)) return { applicable: false, why: 'no retrospective in this checkout' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: CAUSE.notLockOwner }
  }
  let currentFingerprint = null
  let fingerprintError = ''
  try {
    currentFingerprint = computeFingerprint(collectSources())
  } catch (e) {
    // A worktree, another machine — the currency half then stands down alone.
    // The REASON travels with the null so the wrapper can still say it out loud:
    // a check that quietly stops checking is the failure this whole file guards.
    fingerprintError = (e && e.message) || String(e)
  }
  return {
    applicable: true,
    inputs: {
      fingerprintError,
      docText: readFileSync(DOC_PATH, 'utf8'),
      // Guide absent (worktree, other machine) → undefined, which skips its half.
      guideText: existsSync(GUIDE_PATH) ? readFileSync(GUIDE_PATH, 'utf8') : undefined,
      ledgerText: existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, 'utf8') : null,
      currentFingerprint,
      pathExists,
    },
  }
}

/**
 * BOTH verdicts in ONE message. Reporting them serially would make the second
 * defect cost a whole extra turn — §3.32's "an enforcer that grips too late".
 * Each half is isolated: the ledger needs only the two documents and a file
 * probe, so a currency failure must never swallow a ledger verdict.
 */
export function decideRetroCurrency(inputs = {}, { onWarning } = {}) {
  const reasons = []
  try {
    const ledger = evaluateLedger({
      retroText: inputs.docText,
      ledgerText: inputs.ledgerText,
      pathExists: inputs.pathExists,
    })
    if (ledger?.decision === 'block') reasons.push(ledger.reason)
    else if (ledger?.warning && onWarning) onWarning(ledger.warning)
  } catch (e) {
    if (onWarning) onWarning(`retro-currency-guard ledger check errored (allowing): ${e && e.message}`)
  }
  if (inputs.currentFingerprint === null || inputs.currentFingerprint === undefined) {
    if (inputs.fingerprintError && onWarning) {
      onWarning(`retro-currency-guard currency check errored (allowing): ${inputs.fingerprintError}`)
    }
  } else {
    try {
      const verdict = evaluateCurrency({
        docText: inputs.docText,
        guideText: inputs.guideText,
        currentFingerprint: inputs.currentFingerprint,
      })
      if (verdict) reasons.push(verdict.reason)
    } catch (e) {
      if (onWarning) onWarning(`retro-currency-guard currency check errored (allowing): ${e && e.message}`)
    }
  }
  return { block: reasons.length > 0, reason: reasons.join('\n\n') }
}

if (isMainModule(import.meta.url)) {
  try {
    let sessionId = ''
    try {
      sessionId = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      // manual run / non-JSON stdin — the currency check binds regardless
    }

    const gathered = gatherRetroCurrencyInputs({ sessionId })
    if (!gathered.applicable) process.exit(0)

    const verdict = decideRetroCurrency(gathered.inputs, { onWarning: (m) => console.error(m) })
    if (verdict.block) {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: verdict.reason }) + '\n')
    }
    process.exit(0)
  } catch (e) {
    console.error(`retro-currency-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
