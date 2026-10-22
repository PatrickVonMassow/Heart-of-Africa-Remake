// The per-lane switch decisions (may a lane be used at all), plus the
// result-JSON parsing and the merger roster those decisions are read against.
//
// This module is deliberately pure. The state file belongs to the main checkout and
// scripts/lane-switch.mjs owns its I/O; every policy consumer receives the decoded
// state of one lane and derives its answer here instead of carrying a second switch.

import { CROSS, LANES, LEGACY, MAIN, SCARCE, lane, sharesIdentity } from './model-lanes.mjs'

const SWITCH_SCRIPT = 'node scripts/lane-switch.mjs'
/** The per-lane state file in the main checkout's `.claude/`. */
export const STATE_FILE_NAME = 'lane-switch.json'
/** The single-lane file it replaces; read as the scarce entry while the new file is absent. */
export const LEGACY_STATE_FILE_NAME = LEGACY.files.switch
/** The lane a decoded state belongs to when nothing says otherwise. */
export const DEFAULT_SWITCH_ROLE = 'scarce'
/** Every role the switch can address. */
export const SWITCH_ROLES = Object.freeze(LANES.map((record) => record.role))

const switchCommand = (role) => `${SWITCH_SCRIPT} --lane ${role}`

/** Read Claude Code's single-result JSON and identify the TOP-LEVEL answer
 * model by the usage counters shared with exactly one modelUsage row. */
export function parseClaudeResultOutput(text, expected = {}) {
  let value
  try {
    value = JSON.parse(String(text ?? '').trim())
  } catch (error) {
    return { ok: false, result: '', models: [], error: `Claude returned no readable result JSON: ${error.message}` }
  }
  const usage = value?.usage ?? {}
  const rows = Object.entries(value?.modelUsage ?? {})
  const normal = (name) => String(name ?? '').toLowerCase().replace(/\[.*?\]/g, '').replace(/[^a-z0-9]+/g, '-')
  const answers = rows.filter(([, row]) =>
    Number(row?.inputTokens) === Number(usage.input_tokens) &&
    Number(row?.outputTokens) === Number(usage.output_tokens) &&
    Number(row?.cacheReadInputTokens ?? 0) === Number(usage.cache_read_input_tokens ?? 0) &&
    Number(row?.cacheCreationInputTokens ?? 0) === Number(usage.cache_creation_input_tokens ?? 0),
  )
  const answerModel = answers.length === 1 ? answers[0][0] : ''
  // Exactly one row may match the top-level counters; two matches leave the answer unattributed.
  const wanted = answers.length !== 1 ? undefined : answers.find(([name, row]) =>
    normal(name) === normal(expected.id) || normal(row?.canonicalModel) === normal(expected.id),
  )
  const models = rows.map(([name]) => name)
  if (!wanted) {
    return {
      ok: false,
      result: typeof value?.result === 'string' ? value.result : '',
      models,
      answerModel,
      sessionId: String(value?.session_id ?? ''),
      error: `Claude's top-level answer was not attributed to ${expected.name ?? expected.id}; usage named ${models.join(', ') || 'no model'}`,
    }
  }
  if (typeof value?.result !== 'string') {
    return { ok: false, result: '', models, answerModel, sessionId: String(value?.session_id ?? ''), error: 'Claude returned no text result' }
  }
  return { ok: true, result: value.result, models, answerModel: wanted[0], sessionId: String(value?.session_id ?? ''), error: '' }
}

const MAX_TIMESTAMP = 8.64e15

/** The state file in the MAIN checkout, even when called from a worktree. `name` picks the
 *  legacy file name for the read-only fallback. */
export function statePathFrom(gitCommonDir, repoRoot, { sep = '/', name = STATE_FILE_NAME } = {}) {
  const common = String(gitCommonDir ?? '').trim().replace(/[/\\]+$/, '')
  const main = /(?:^|[/\\])\.git$/.test(common) ? common.replace(/[/\\]\.git$/, '') : String(repoRoot ?? '')
  return `${main || String(repoRoot ?? '')}${sep}.claude${sep}${name}`
}

function roleOf(role) {
  const wanted = String(role ?? DEFAULT_SWITCH_ROLE)
  if (!SWITCH_ROLES.includes(wanted)) throw new Error(`lane-switch: unknown lane "${wanted}" (lanes: ${SWITCH_ROLES.join(', ')})`)
  return wanted
}

const repair = (role = DEFAULT_SWITCH_ROLE) =>
  `Run \`${SWITCH_SCRIPT} --status\`; set it only on the user's instruction with ` +
  `\`${switchCommand(role)} --on --why "…"\` or \`${switchCommand(role)} --off --why "…"\`.`

function unusable(kind, detail, role = DEFAULT_SWITCH_ROLE) {
  return {
    ok: false,
    role,
    state: null,
    reason: '',
    setBy: '',
    changedAt: null,
    problem: `the ${role} lane switch state is ${kind}${detail ? ` (${detail})` : ''}. ${repair(role)}`,
  }
}

/** A read error represented as state, so the pure failure contract is testable. */
export function unreadableState(error, role = DEFAULT_SWITCH_ROLE) {
  return unusable('unreadable', String(error?.message ?? error ?? 'unknown read error'), roleOf(role))
}

/** The state of a lane nobody recorded a decision for: only the switch-gated lane fails
 *  closed; every other lane is usable until switched off. */
function defaultState(role) {
  if (lane(role).scarce) return unusable('absent', '', role)
  return { ok: true, role, state: 'on', reason: 'no recorded decision; this lane is on by default', setBy: 'default', changedAt: 0, problem: '' }
}

function decodeEntry(value, role) {
  const state = value?.state === 'on' || value?.state === 'off' ? value.state : null
  const reason = String(value?.reason ?? '').trim()
  const setBy = String(value?.setBy ?? '').trim()
  const changedAt = Number(value?.changedAt)
  if (!state) return unusable('garbled', 'state must be "on" or "off"', role)
  if (!reason) return unusable('garbled', 'reason is missing', role)
  if (!setBy) return unusable('garbled', 'setter is missing', role)
  if (!Number.isFinite(changedAt) || changedAt <= 0 || changedAt > MAX_TIMESTAMP) {
    return unusable('garbled', 'timestamp is invalid', role)
  }
  return { ok: true, role, state, reason, setBy, changedAt, problem: '' }
}

/**
 * Decode one lane's entry from a state file's text. The per-lane form is
 * `{ lanes: { <role>: {state, reason, setBy, changedAt} } }`; a flat single record (the
 * legacy file's form) is the scarce lane's entry. No broken form defaults to either direction.
 */
export function readState(raw, role = DEFAULT_SWITCH_ROLE) {
  const wanted = roleOf(role)
  if (raw == null) return defaultState(wanted)
  if (typeof raw !== 'string' || !raw.trim()) return unusable('empty or not text', '', wanted)

  let value
  try {
    value = JSON.parse(raw)
  } catch (error) {
    return unusable('not valid JSON', error.message, wanted)
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && 'lanes' in value) {
    const lanes = value.lanes
    if (!lanes || typeof lanes !== 'object' || Array.isArray(lanes)) return unusable('garbled', 'lanes must be an object', wanted)
    return lanes[wanted] == null ? defaultState(wanted) : decodeEntry(lanes[wanted], wanted)
  }
  // A flat record is the scarce lane's legacy entry; it says nothing about another lane.
  if (!lane(wanted).scarce) return defaultState(wanted)
  return decodeEntry(value, wanted)
}

/** Build the complete entry the CLI writes for one lane. */
export function writeState(state, { why = '', by = '', now = Date.now() } = {}) {
  const direction = String(state ?? '').trim().toLowerCase()
  const reason = String(why ?? '').trim()
  const setBy = String(by ?? '').trim()
  const changedAt = Number(now)
  if (direction !== 'on' && direction !== 'off') throw new Error(`lane-switch: state must be on or off`)
  if (!reason || /[\r\n]/.test(reason)) throw new Error('lane-switch: --why needs one non-empty line')
  if (!setBy || /[\r\n]/.test(setBy)) throw new Error('lane-switch: the setter identity is unavailable')
  if (!Number.isFinite(changedAt) || changedAt <= 0 || changedAt > MAX_TIMESTAMP) {
    throw new Error('lane-switch: the change timestamp is invalid')
  }
  return { state: direction, reason, setBy, changedAt }
}

/**
 * The per-lane file after setting one lane's entry. `currentRaw` is the new file's text
 * (null when absent); `legacyRaw` is the legacy file's text, whose scarce decision is
 * carried over when the new file does not exist yet. An unreadable current file refuses
 * rather than dropping other lanes' decisions.
 */
export function writeLaneFile(currentRaw, role, entry, { legacyRaw = null } = {}) {
  const wanted = roleOf(role)
  const lanes = {}
  if (currentRaw != null) {
    let value
    try {
      value = JSON.parse(currentRaw)
    } catch (error) {
      throw new Error(`lane-switch: the state file is not valid JSON (${error.message}); repair it before switching`)
    }
    if (!value?.lanes || typeof value.lanes !== 'object' || Array.isArray(value.lanes)) {
      throw new Error('lane-switch: the state file has no lanes object; repair it before switching')
    }
    Object.assign(lanes, value.lanes)
  } else if (legacyRaw != null) {
    const carried = readState(legacyRaw, DEFAULT_SWITCH_ROLE)
    if (carried.ok) {
      const { state, reason, setBy, changedAt } = carried
      lanes[DEFAULT_SWITCH_ROLE] = { state, reason, setBy, changedAt }
    }
  }
  lanes[wanted] = writeState(entry.state, { why: entry.reason, by: entry.setBy, now: entry.changedAt })
  return { lanes }
}

/** Refuse an unknown state at every decision boundary. */
export function requireState(value) {
  if (!value?.ok || (value.state !== 'on' && value.state !== 'off')) {
    throw new Error(value?.problem || `the ${value?.role ?? DEFAULT_SWITCH_ROLE} lane switch state is unusable. ${repair(value?.role)}`)
  }
  return value
}

const stateRole = (state) => (SWITCH_ROLES.includes(state?.role) ? state.role : DEFAULT_SWITCH_ROLE)

export function laneIsOn(value) {
  return requireState(value).state === 'on'
}

/** The main-runtime serving chain in force. */
export function servingChain(value) {
  return Object.freeze(servingRoute(value).map((entry) => entry.model))
}

/** The same recorded chain with the CLI ids needed for an explicit lane handoff. */
export function servingRoute(value) {
  return Object.freeze([
    Object.freeze({ model: MAIN.displayName, id: MAIN.modelId }),
    ...(laneIsOn(value) ? [Object.freeze({ model: SCARCE.displayName, id: SCARCE.modelId })] : []),
    Object.freeze({ model: MAIN.fallback.displayName, id: MAIN.fallback.modelId }),
  ])
}

/** The launcher CLI's first fallback model, from the same serving chain. */
export function servingFallbackModelId(value) {
  return laneIsOn(value) ? SCARCE.modelId : MAIN.fallback.modelId
}

/** The session-start policy sentence, with both sides derived from one state. */
export function servingPolicyLine(value) {
  const state = requireState(value)
  const chain = servingChain(state)
  const refused = state.state === 'off' ? `${SCARCE.displayName} (the scarce lane, switched off) and ` : ''
  return (
    `THE SERVING MODEL of this session — the one running the batch — is ${chain.join(', then ')}. ` +
    `${refused}every model outside that chain are NOT acceptable under the recorded lane switch ` +
    `(${SWITCH_SCRIPT} --status): if the serving model is outside that chain, do NOT work — the ` +
    'serving-model tripwire records and starts a trusted handoff to the next allowed lane. Only that fresh ' +
    'lane may verify the offending trailers and advance the baseline; an unreachable chain probes on a clock.'
  )
}

/** The named authors of the two halves, blanks dropped. */
function authorList(authors) {
  return (Array.isArray(authors) ? authors : [authors]).map((a) => String(a ?? '').trim()).filter(Boolean)
}

/**
 * Lane identity: two designations name the same model when they mention a common lane
 * identity in the registry (scripts/model-lanes.mjs). Current and retired names of a lane
 * are one lane; a compound name ("A / B") mentions each part, so a forged author marker
 * cannot leave a named co-model looking untainted.
 */
function sameModelName(a, b) {
  return sharesIdentity(a, b)
}

/** The model that folds a blind-parallel union. */
export function mergerModel(value, authors = []) {
  const on = laneIsOn(value)
  // THE RULE IS "THE MODEL THAT WROTE NEITHER HALF" (CLAUDE.md §6). The roster is
  // consulted against the actual authors (a 13.08.2026 stage once handed the merge to an
  // author of the material), and the switch keeps its authority over exactly one thing:
  // whether the scarce lane may be spent.
  const roster = on ? [SCARCE.displayName, CROSS.displayName, MAIN.trailerName] : [CROSS.displayName, MAIN.trailerName]
  const wrote = (model) => authorList(authors).some((author) => sameModelName(model, author))
  const untainted = roster.find((model) => !wrote(model))
  // None left means every roster model is named as an author — two models for three
  // roles while the scarce lane is OFF, or compound author names. The caller then owes
  // the recorded two-model fallback, so the previous answer is kept for it to judge.
  return untainted ?? roster[0]
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
  // back to the switch-only reading and, with the scarce lane ON, returned no framing.
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

/** The role-worded prefix of the canonical switch-fallback reason. */
const switchFallbackPrefix = () =>
  `The ${SCARCE.role} lane is switched off by the recorded lane switch (${SWITCH_SCRIPT} --status): `

/** The canonical, ledger-safe reason the cross lane may merge its own blind half while the
 *  scarce lane is OFF. */
export function mergeFallbackReason(value) {
  const state = requireState(value)
  if (state.state !== 'off') return ''
  return `${switchFallbackPrefix()}${state.reason}`
}

/** The shared refusal text for every route that would otherwise spend a switched-off lane. */
export function laneRefusalReason(value) {
  const state = requireState(value)
  if (state.state === 'on') return ''
  const role = stateRole(state)
  return (
    `${lane(role).displayName} (the ${role} lane) is refused because the recorded lane switch is ` +
    `${state.state.toUpperCase()} (${SWITCH_SCRIPT} --status): ${state.reason}`
  )
}

/** Recognise only the form emitted above, or a form landed ledger rows carry
 *  (LEGACY.switchFallbackPrefixes); ordinary fallback claims keep the outage rule. */
export function isSwitchFallbackReason(reason) {
  const text = String(reason ?? '').trim()
  return [switchFallbackPrefix(), ...LEGACY.switchFallbackPrefixes].some(
    (prefix) => text.startsWith(prefix) && text.slice(prefix.length).trim().length > 0,
  )
}

/** The complete status text always names lane, direction, reason, setter, and time. */
export function statusReport(value) {
  const state = requireState(value)
  const role = stateRole(state)
  const head = `lane-switch: ${role} (${lane(role).displayName}) ${state.state.toUpperCase()} — reason: ${state.reason}`
  return state.changedAt > 0 ? `${head} — set by ${state.setBy} at ${new Date(state.changedAt).toISOString()}` : head
}
