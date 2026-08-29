// SESSION CLASS POLICY FOR THE CONTEXT CEILING (point 748) — pure.
//
// The budget arithmetic in context-budget-core answers whether a call fits.
// This module answers the separate question: who is making it, and what happens
// when it does not fit. No class is exempt. The only differences are the remedy
// and the conversation-safe operations which can never be denied.

export const CONTEXT_SESSION_CLASS = Object.freeze({
  SUBAGENT: 'subagent',
  BATCH_OWNER: 'batch-owner',
  ATTENDED: 'attended',
})

export const CONTEXT_OPERATION = Object.freeze({
  CALL: 'call',
  READ: 'read',
  ANSWER: 'answer',
})

/**
 * Classify a REAL hook payload.
 *
 * `agent_id` is the Claude Code hook contract's identity signal: it is present
 * only while a hook runs inside a subagent call. `agent_type` is deliberately
 * ignored because a top-level session started with `--agent` carries it too.
 * Only after excluding that shape does lock equality distinguish the batch
 * owner from the attended main window.
 */
export function classifyContextSession({ agentId = null, sessionId = '', ownerSessionId = '' } = {}) {
  if (typeof agentId === 'string' && agentId.trim()) return CONTEXT_SESSION_CLASS.SUBAGENT
  const sid = String(sessionId ?? '').trim()
  const owner = String(ownerSessionId ?? '').trim()
  if (sid && owner && sid === owner) return CONTEXT_SESSION_CLASS.BATCH_OWNER
  return CONTEXT_SESSION_CLASS.ATTENDED
}

/** One budget/permit identity per real context, even when a subagent inherits its caller's session id. */
export function contextSessionIdentity({ agentId = null, sessionId = '' } = {}) {
  const sid = String(sessionId ?? '').trim()
  const agent = typeof agentId === 'string' ? agentId.trim() : ''
  return agent ? `${sid}:agent:${agent}` : sid
}

/** Direct reading tools are admitted and booked, but never denied. */
export function contextOperationOf({ toolName = '', operation = null } = {}) {
  if (Object.values(CONTEXT_OPERATION).includes(operation)) return operation
  const tool = String(toolName ?? '').trim().toLowerCase()
  if (tool === 'answer') return CONTEXT_OPERATION.ANSWER
  if (['read', 'glob', 'grep', 'webfetch', 'websearch'].includes(tool)) return CONTEXT_OPERATION.READ
  return CONTEXT_OPERATION.CALL
}

export const SESSION_CEILING_REMEDIES = Object.freeze({
  [CONTEXT_SESSION_CLASS.SUBAGENT]: Object.freeze({
    id: 'return-what-you-have',
    text: 'Stop this operation and return what you have to the caller; the caller can carry on.',
  }),
  [CONTEXT_SESSION_CLASS.BATCH_OWNER]: Object.freeze({
    id: 'boundary',
    text: 'Finish the bounded step and take the existing context boundary.',
  }),
  [CONTEXT_SESSION_CLASS.ATTENDED]: Object.freeze({
    id: 'clear',
    text: 'This attended main window cannot take a boundary. Use `/clear` before another growing call.',
  }),
})

/**
 * Apply session policy to one already-computed prospective budget decision.
 * `wouldRefuse` deliberately remains true in observe mode and when a permit is
 * spent: both are admitted calls which an armed, unpermitted fence would deny.
 */
export function sessionCeilingDecision({
  sessionClass = CONTEXT_SESSION_CLASS.ATTENDED,
  budgetDecision = null,
  operation = CONTEXT_OPERATION.CALL,
  mode = 'observe',
  permitUsed = false,
} = {}) {
  const klass = Object.values(CONTEXT_SESSION_CLASS).includes(sessionClass)
    ? sessionClass
    : CONTEXT_SESSION_CLASS.ATTENDED
  const op = contextOperationOf({ operation })
  const remedy = SESSION_CEILING_REMEDIES[klass]
  const conversationSafe = op === CONTEXT_OPERATION.ANSWER || op === CONTEXT_OPERATION.READ
  const insufficient = budgetDecision?.fits === false
  const wouldRefuse = insufficient && !conversationSafe
  const armed = String(mode).toLowerCase() === 'armed'
  const refused = wouldRefuse && armed && permitUsed !== true

  return {
    sessionClass: klass,
    operation: op,
    allowed: !refused,
    refused,
    observed: wouldRefuse,
    permitted: wouldRefuse && armed && permitUsed === true,
    conversationSafe,
    remedy,
  }
}

/**
 * The once-per-session attended warning fired by the already-computed header
 * reading. Suppressions do not consume it; the next quiet prompt may still ask.
 */
export function attendedCeilingNoticeDecision({
  sessionClass = CONTEXT_SESSION_CLASS.ATTENDED,
  tokens = null,
  ceiling = 150_000,
  alreadyNotified = false,
  gitBusy = false,
  verificationRunning = false,
} = {}) {
  if (sessionClass === CONTEXT_SESSION_CLASS.BATCH_OWNER) return { speak: false, reason: 'batch-owner-unchanged' }
  if (sessionClass !== CONTEXT_SESSION_CLASS.ATTENDED) return { speak: false, reason: 'not-attended' }
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) {
    return { speak: false, reason: 'unreadable' }
  }
  const mark = typeof ceiling === 'number' && Number.isFinite(ceiling) && ceiling > 0 ? ceiling : 150_000
  if (tokens <= mark) return { speak: false, reason: 'below' }
  if (alreadyNotified) return { speak: false, reason: 'already-notified' }
  if (gitBusy) return { speak: false, reason: 'git-busy' }
  if (verificationRunning) return { speak: false, reason: 'verification-running' }
  return { speak: true, reason: 'past-ceiling', tokens, ceiling: mark }
}
