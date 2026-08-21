// Runtime transaction for pre-call context admission. Pure arithmetic lives in
// context-budget-core; this module serializes the pending-debit ledger and the
// optional one-use permit across separate PreToolUse hook processes.
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import {
  bookPendingDebit,
  countUnknownTypeCost,
  emptyPendingLedger,
  reconcilePendingLedger,
  remainingBudgetDecision,
} from './context-budget-core.mjs'
import { consumeContextPermit, withContextFenceStateLock } from './context-fence-permit.mjs'
import { CONTEXT_HANDOVER_RESERVE_TOKENS, normalizeFenceMode } from './context-watermark-core.mjs'
import { repoPath } from './repo-paths.mjs'

export const CONTEXT_FENCE_LEDGER_PATH = repoPath('.claude/context-fence-ledger.json')
export const CONTEXT_FENCE_LEDGER_LOCK_PATH = repoPath('.claude/context-fence-ledger.lock')

export function readPendingLedger(path = CONTEXT_FENCE_LEDGER_PATH, sessionId = '') {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : emptyPendingLedger(sessionId)
  } catch {
    return emptyPendingLedger(sessionId)
  }
}

/**
 * The decision plus the two ledger terms its refusal text quotes. Both callers
 * go through here: a status projection that omitted them printed `pending debit
 * 0` beside its own JSON reporting the real balance.
 */
function decide(input, ledger) {
  const decision = remainingBudgetDecision({ ...input, pendingDebit: ledger.pendingDebit })
  decision.pendingDebit = ledger.pendingDebit
  decision.handoverReserve = input?.handoverReserve ?? CONTEXT_HANDOVER_RESERVE_TOKENS
  return decision
}

/** Compute, optionally consume a permit, and persist the exact debit atomically. */
export function admitContextCall(input, {
  ledgerPath = CONTEXT_FENCE_LEDGER_PATH,
  ledgerLockPath = CONTEXT_FENCE_LEDGER_LOCK_PATH,
  permitPaths = {},
} = {}) {
  const mode = normalizeFenceMode(input?.mode)
  return withContextFenceStateLock(() => {
    const reconciled = reconcilePendingLedger(readPendingLedger(ledgerPath, input?.sessionId), {
      sessionId: input?.sessionId,
      reading: input?.reading,
    })
    let ledger = reconciled.ledger
    const decision = decide(input, ledger)

    if (decision.unknownTypeCost) ledger = countUnknownTypeCost(ledger)

    let permit = { used: false, reason: null, permit: null, record: null }
    const wouldRefuse = decision.fits === false
    if (wouldRefuse && mode === 'armed') {
      permit = consumeContextPermit({
        sessionId: input?.sessionId,
        point: input?.point,
        reading: input?.reading,
        projectedCost: decision.projectedCost,
        caller: input?.caller,
        toolUseId: input?.toolUseId,
      }, permitPaths)
    }
    const block = wouldRefuse && mode === 'armed' && !permit.used
    // Observation mode admits what an armed fence would refuse, and therefore
    // books it. Armed refusals never execute and are not phantom-debited.
    if (decision.book && !block) ledger = bookPendingDebit(ledger, decision.projectedCost)

    mkdirSync(dirname(ledgerPath), { recursive: true })
    writeJsonAtomic(ledgerPath, ledger)
    return {
      mode,
      block,
      observed: wouldRefuse,
      permitted: permit.used,
      permitReason: permit.reason,
      decision,
      ledger,
      reconciliation: {
        reconciled: reconciled.reconciled,
        actualGrowth: reconciled.actualGrowth,
      },
    }
  }, { lockPath: ledgerLockPath })
}

/** Read-only status projection; it never books a debit or consumes a permit. */
export function inspectContextCall(input, { ledgerPath = CONTEXT_FENCE_LEDGER_PATH } = {}) {
  const reconciled = reconcilePendingLedger(readPendingLedger(ledgerPath, input?.sessionId), {
    sessionId: input?.sessionId,
    reading: input?.reading,
  })
  return {
    decision: decide(input, reconciled.ledger),
    ledger: reconciled.ledger,
    reconciliation: { reconciled: reconciled.reconciled, actualGrowth: reconciled.actualGrowth },
  }
}
