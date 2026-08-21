// Runtime transaction for pre-call context admission. Pure arithmetic lives in
// context-budget-core; this module serializes the pending-debit ledger and the
// optional one-use permit across separate PreToolUse hook processes.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
import {
  CONTEXT_SESSION_CLASS,
  contextOperationOf,
  sessionCeilingDecision,
} from './session-context-ceiling-core.mjs'

export const CONTEXT_FENCE_LEDGER_PATH = repoPath('.claude/context-fence-ledger.json')
export const CONTEXT_FENCE_LEDGER_LOCK_PATH = repoPath('.claude/context-fence-ledger.lock')

/** Separate stale-reading debits for every real context. Subagents inherit the
 * caller's session id, so the hook folds their `agent_id` into that identity
 * before asking here. A shared ledger would let one context reset another's
 * pending debit whenever their transcript readings alternated. */
export function contextLedgerPath(sessionId, legacyBase = CONTEXT_FENCE_LEDGER_PATH) {
  const key = createHash('sha256').update(String(sessionId ?? '')).digest('hex').slice(0, 24)
  return resolve(dirname(legacyBase), 'context-fence-ledgers', `${key}.json`)
}

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
export function admitContextCall(input, options = {}) {
  const ledgerPath = options.ledgerPath ?? contextLedgerPath(input?.sessionId)
  const ledgerLockPath = options.ledgerLockPath ?? CONTEXT_FENCE_LEDGER_LOCK_PATH
  const permitPaths = options.permitPaths ?? {}
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
    const operation = contextOperationOf({ toolName: input?.toolName, operation: input?.operation })
    const preliminaryPolicy = sessionCeilingDecision({
      sessionClass: input?.sessionClass ?? CONTEXT_SESSION_CLASS.BATCH_OWNER,
      budgetDecision: decision,
      operation,
      mode,
    })
    const wouldRefuse = preliminaryPolicy.observed
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
    const sessionPolicy = sessionCeilingDecision({
      sessionClass: input?.sessionClass ?? CONTEXT_SESSION_CLASS.BATCH_OWNER,
      budgetDecision: decision,
      operation,
      mode,
      permitUsed: permit.used,
    })
    const block = sessionPolicy.refused
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
      sessionPolicy,
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
export function inspectContextCall(input, options = {}) {
  const ledgerPath = options.ledgerPath ?? contextLedgerPath(input?.sessionId)
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
