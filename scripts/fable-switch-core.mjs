// The one decision about whether Fable may be used at all.
//
// This module is deliberately pure. The state file belongs to the main checkout and
// scripts/fable-switch.mjs owns its I/O; every policy consumer receives the decoded
// state and derives its answer here instead of carrying a second switch.

export const SWITCH_COMMAND = 'node scripts/fable-switch.mjs'
export const STATE_FILE_NAME = 'fable-switch.json'
export const FABLE_MODEL = 'Fable 5'
export const SOL_MODEL = 'GPT-5.6 Sol'
export const FABLE_MODEL_ID = 'claude-fable-5'
export const OPUS_FALLBACK_MODEL_ID = 'claude-opus-4-8[1m]'

const MAX_TIMESTAMP = 8.64e15

/** The state file in the MAIN checkout, even when called from a worktree. */
export function statePathFrom(gitCommonDir, repoRoot, { sep = '/' } = {}) {
  const common = String(gitCommonDir ?? '').trim().replace(/[/\\]+$/, '')
  const main = /(?:^|[/\\])\.git$/.test(common) ? common.replace(/[/\\]\.git$/, '') : String(repoRoot ?? '')
  return `${main || String(repoRoot ?? '')}${sep}.claude${sep}${STATE_FILE_NAME}`
}

const repair = () =>
  `Run \`${SWITCH_COMMAND} --status\`; set it only on the user's instruction with ` +
  `\`${SWITCH_COMMAND} --on --why "…"\` or \`${SWITCH_COMMAND} --off --why "…"\`.`

function unusable(kind, detail) {
  return {
    ok: false,
    state: null,
    reason: '',
    setBy: '',
    changedAt: null,
    problem: `the Fable switch state is ${kind}${detail ? ` (${detail})` : ''}. ${repair()}`,
  }
}

/** A read error represented as state, so the pure failure contract is testable. */
export function unreadableState(error) {
  return unusable('unreadable', String(error?.message ?? error ?? 'unknown read error'))
}

/** Decode a state file. No missing or broken form defaults to either direction. */
export function readState(raw) {
  if (raw == null) return unusable('absent')
  if (typeof raw !== 'string' || !raw.trim()) return unusable('empty or not text')

  let value
  try {
    value = JSON.parse(raw)
  } catch (error) {
    return unusable('not valid JSON', error.message)
  }

  const state = value?.state === 'on' || value?.state === 'off' ? value.state : null
  const reason = String(value?.reason ?? '').trim()
  const setBy = String(value?.setBy ?? '').trim()
  const changedAt = Number(value?.changedAt)
  if (!state) return unusable('garbled', 'state must be "on" or "off"')
  if (!reason) return unusable('garbled', 'reason is missing')
  if (!setBy) return unusable('garbled', 'setter is missing')
  if (!Number.isFinite(changedAt) || changedAt <= 0 || changedAt > MAX_TIMESTAMP) {
    return unusable('garbled', 'timestamp is invalid')
  }
  return { ok: true, state, reason, setBy, changedAt, problem: '' }
}

/** Build the complete record the CLI writes. */
export function writeState(state, { why = '', by = '', now = Date.now() } = {}) {
  const direction = String(state ?? '').trim().toLowerCase()
  const reason = String(why ?? '').trim()
  const setBy = String(by ?? '').trim()
  const changedAt = Number(now)
  if (direction !== 'on' && direction !== 'off') throw new Error(`fable-switch: state must be on or off`)
  if (!reason || /[\r\n]/.test(reason)) throw new Error('fable-switch: --why needs one non-empty line')
  if (!setBy || /[\r\n]/.test(setBy)) throw new Error('fable-switch: the setter identity is unavailable')
  if (!Number.isFinite(changedAt) || changedAt <= 0 || changedAt > MAX_TIMESTAMP) {
    throw new Error('fable-switch: the change timestamp is invalid')
  }
  return { state: direction, reason, setBy, changedAt }
}

/** Refuse an unknown state at every decision boundary. */
export function requireState(value) {
  if (!value?.ok || (value.state !== 'on' && value.state !== 'off')) {
    throw new Error(value?.problem || `the Fable switch state is unusable. ${repair()}`)
  }
  return value
}

export function fableIsOn(value) {
  return requireState(value).state === 'on'
}

/** The Claude serving chain in force. */
export function servingChain(value) {
  return Object.freeze(['Opus 5', ...(fableIsOn(value) ? [FABLE_MODEL] : []), 'Opus 4.8'])
}

/** The launcher CLI's first fallback model, from the same serving chain. */
export function servingFallbackModelId(value) {
  return fableIsOn(value) ? FABLE_MODEL_ID : OPUS_FALLBACK_MODEL_ID
}

/** The session-start policy sentence, with both sides derived from one state. */
export function servingPolicyLine(value) {
  const state = requireState(value)
  const chain = servingChain(state)
  const forbidden = [...(state.state === 'off' ? [FABLE_MODEL] : []), 'Sonnet', 'Haiku']
  return (
    `THE SERVING MODEL of this session — the one running the batch — is ${chain.join(', then ')}. ` +
    `${forbidden.join(', ')} and every other model are NOT acceptable under the recorded Fable switch ` +
    `(${SWITCH_COMMAND} --status): if the serving model is outside that chain, do NOT work — create ` +
    '.claude/batch-paused (reason: forbidden serving model) and send an ntfy alert via scripts/notify.mjs instead.'
  )
}

/** The model that folds a blind-parallel union. */
export function mergerModel(value) {
  return fableIsOn(value) ? FABLE_MODEL : SOL_MODEL
}

/** Additional framing owed when Sol merges material that includes Sol's own half. */
export function mergePromptFraming(value) {
  return fableIsOn(value)
    ? ''
    : 'DECORRELATED MERGE FRAMING: reconstruct the union from the two numbered evidence lists and their invariants; do not reuse the framing, ordering, or categories of Sol\'s own half.'
}

/** The canonical, ledger-safe reason Sol may merge its own blind half while OFF. */
export function mergeFallbackReason(value) {
  const state = requireState(value)
  if (state.state !== 'off') return ''
  return `${FABLE_MODEL} is switched off by the recorded Fable switch (${SWITCH_COMMAND} --status): ${state.reason}`
}

/** The shared refusal text for every route that would otherwise spend Fable. */
export function fableRefusalReason(value) {
  const state = requireState(value)
  if (state.state === 'on') return ''
  return (
    `${FABLE_MODEL} is refused because the recorded Fable switch is ${state.state.toUpperCase()} ` +
    `(${SWITCH_COMMAND} --status): ${state.reason}`
  )
}

/** Recognise only the form emitted above; ordinary fallback claims keep the outage rule. */
export function isSwitchFallbackReason(reason) {
  const text = String(reason ?? '').trim()
  const prefix = `${FABLE_MODEL} is switched off by the recorded Fable switch (${SWITCH_COMMAND} --status): `
  return text.startsWith(prefix) && text.slice(prefix.length).trim().length > 0
}

/** The complete status text always names direction, reason, setter, and time. */
export function statusReport(value) {
  const state = requireState(value)
  return (
    `fable-switch: ${state.state.toUpperCase()} — reason: ${state.reason} — ` +
    `set by ${state.setBy} at ${new Date(state.changedAt).toISOString()}`
  )
}
