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
export const OPUS_MODEL = 'Opus 5'
export const OPUS_FALLBACK_MODEL = 'Opus 4.8'
export const OPUS_MODEL_ID = 'claude-opus-5[1m]'
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
  return Object.freeze(servingRoute(value).map((lane) => lane.model))
}

/** The same recorded chain with the CLI ids needed for an explicit lane handoff. */
export function servingRoute(value) {
  return Object.freeze([
    Object.freeze({ model: OPUS_MODEL, id: OPUS_MODEL_ID }),
    ...(fableIsOn(value) ? [Object.freeze({ model: FABLE_MODEL, id: FABLE_MODEL_ID })] : []),
    Object.freeze({ model: OPUS_FALLBACK_MODEL, id: OPUS_FALLBACK_MODEL_ID }),
  ])
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
    `(${SWITCH_COMMAND} --status): if the serving model is outside that chain, do NOT work — the ` +
    'serving-model tripwire records and starts a trusted handoff to the next allowed lane. Only that fresh ' +
    'lane may verify the offending trailers and advance the baseline; an unreachable chain probes on a clock.'
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
    // A name carrying MODEL WORDS OF BOTH VENDORS — "Fable / GPT-5.6 Sol" — is not
    // resolved to either: first-match made it Sol, and mergerModel then offered
    // Fable as untainted although the marker names Fable (re-review round 6). Such
    // a name matches EVERY model it actually MENTIONS — and only those (round 7:
    // a wildcard also disqualified models the name never named).
    const anthropicModel = family.some((w) => ['fable', 'opus', 'sonnet', 'haiku'].includes(w))
    const openaiModel = family.includes('sol') || family.includes('gpt')
    if (anthropicModel && openaiModel) {
      const keys = family.filter((w) => ['sol', 'fable', 'opus', 'sonnet', 'haiku'].includes(w))
      return { keys: [...new Set(keys)], version: '' }
    }
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
  if (!x || !y) return false
  const keysOf = (p) => (p.keys ? p.keys : [p.key])
  if (!keysOf(x).some((k) => keysOf(y).includes(k))) return false
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
  // ABSENCE OF EVIDENCE IS NOT EVIDENCE OF ABSENCE, and the safe reading is ONE
  // rule rather than a special case for silence. The framing is owed unless both
  // halves are named AND neither name is the merger's: an unnamed half could be
  // the merger's own, so it is treated as though it were.
  //
  // The earlier version had a third state — nothing supplied at all — which fell
  // back to the switch-only reading and, with Fable ON, returned no framing.
  // Cross-vendor review of point 889 measured what that costs: the caller filtered
  // its blank slots away, two unknown halves arrived as an empty array, and the
  // least safe case got the answer meant for a caller that was not asking about
  // authors. The caller no longer filters, and this no longer has a branch that
  // reads silence as safety.
  const named = slots.filter((author) => String(author ?? '').trim())
  const selfMerge = named.length < 2 || named.some((author) => sameModelName(merger, author))
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
