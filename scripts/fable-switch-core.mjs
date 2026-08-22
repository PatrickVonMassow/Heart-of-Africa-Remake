// The one decision about whether Fable may be used at all.
//
// This module is deliberately pure. The state file belongs to the main checkout and
// scripts/fable-switch.mjs owns its I/O; every policy consumer receives the decoded
// state and derives its answer here instead of carrying a second switch.

export const SWITCH_COMMAND = 'node scripts/fable-switch.mjs'
export const STATE_FILE_NAME = 'fable-switch.json'
export const FABLE_MODEL = 'Fable 5'
export const SOL_MODEL = 'GPT-5.6 Sol'
export const CLAUDE_MODEL = 'Claude Opus 5'
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
/** The named authors of the two halves, blanks dropped. */
function authorList(authors) {
  return (Array.isArray(authors) ? authors : [authors]).map((a) => String(a ?? '').trim()).filter(Boolean)
}

/**
 * Model identity, family plus version — the same reading `mechanism-review-core.sameModel`
 * uses. It is duplicated rather than imported because this module is the switch's pure
 * policy core and importing the review core would make the two circular.
 */
function sameModelName(a, b) {
  const parse = (value) => {
    const text = String(value ?? '').toLowerCase()
    const family = text.match(/\b(sol|gpt|fable|opus|claude|sonnet|haiku)\b/g) ?? []
    if (!family.length) return null
    // "GPT-5.6 Sol" and "Claude Opus 5" both name a vendor word and a model word; the
    // LAST recognised word is the model, which is what the roster entries are keyed on.
    const key = family.includes('sol') ? 'sol' : family.includes('fable') ? 'fable' : family[family.length - 1]
    // THE VERSION IS NOT ALWAYS ATTACHED TO THE KEY WORD (four-eyes finding 1 on this
    // change): "GPT-5.6 Sol" carries its version on the VENDOR word, so keying the
    // search on "sol" found no digits and made every Sol version compare equal —
    // "GPT-5.6 Sol" and "GPT-6 Sol" were one model. The version is therefore the first
    // one any recognised word carries, wherever in the name it sits.
    const version = [...text.matchAll(/\b(?:sol|gpt|fable|opus|claude|sonnet|haiku)[\s-]*(\d+(?:\.\d+)?)/g)]
      .map((m) => m[1])
      .find(Boolean)
    return { key, version: version ?? '' }
  }
  const x = parse(a)
  const y = parse(b)
  if (!x || !y || x.key !== y.key) return false
  if (!x.version || !y.version) return true
  return x.version === y.version
}

export function mergerModel(value, authors = []) {
  const on = fableIsOn(value)
  // THE RULE IS "THE MODEL THAT WROTE NEITHER HALF" (CLAUDE.md §6), and for a long
  // time this function could not express it: it answered Fable-or-Sol, so with Fable
  // switched off the only merger it would ever name was Sol. Measured on the 13.08.2026
  // stage recovered under docs/four-eyes/: half A is Fable's and half B is Sol's, and
  // this function insisted that Sol — an author — owned the merge, while Claude, which
  // wrote neither half, was refused. That inverts the one rule the merge step exists to
  // enforce. The roster is therefore consulted against the actual authors, and the
  // switch keeps its authority over exactly one thing: whether Fable may be spent.
  const roster = on ? [FABLE_MODEL, SOL_MODEL, CLAUDE_MODEL] : [SOL_MODEL, CLAUDE_MODEL]
  const wrote = (model) => authorList(authors).some((author) => sameModelName(model, author))
  const untainted = roster.find((model) => !wrote(model))
  // None left means only two models existed for three roles — the caller then owes the
  // recorded two-model fallback, so the previous answer is kept for it to judge.
  return untainted ?? (on ? FABLE_MODEL : SOL_MODEL)
}

/** Additional framing owed when the merging model merges its own blind half. */
export function mergePromptFraming(value, authors = []) {
  const merger = mergerModel(value, authors)
  const slots = Array.isArray(authors) ? authors : authors == null ? [] : [authors]
  // ABSENCE OF EVIDENCE IS NOT EVIDENCE OF ABSENCE. Three states, not two:
  //   · NOTHING supplied — a caller not using this at all, so the older switch-only
  //     reading stands and nothing about existing callers shifts.
  //   · BOTH halves named — the strict reading: framing owed only on a real self-merge.
  //   · PARTLY named — the caller is telling us who it knows, and one half is unknown.
  //     That unknown half could be the merger's own, so the framing is OWED. Reading
  //     the silence the other way retires the framing exactly where it is least safe
  //     (four-eyes finding 2 on this change: with the switch ON and one half blank the
  //     previous version dropped it, and a test of mine pinned that unsafe outcome).
  const named = slots.filter((author) => String(author ?? '').trim())
  const selfMerge = slots.length === 0
    ? !fableIsOn(value)
    : named.length < 2 || named.some((author) => sameModelName(merger, author))
  if (!selfMerge) return ''
  return (
    'DECORRELATED MERGE FRAMING: reconstruct the union from the two numbered evidence lists ' +
    `and their invariants; do not reuse the framing, ordering, or categories of ${merger}'s own half.`
  )
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
