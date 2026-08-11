// THE CHEAP SWITCH THAT MOVES READ-ONLY WORK BETWEEN THE TWO VENDORS (point 654).
//
// WHY IT IS CHEAP, and why that is the whole design: the user pays two vendors whose
// allowances run out at different times and wants to shift load towards OpenAI BEFORE
// the Anthropic volume is nearly spent. Moving READ-ONLY work costs almost nothing to
// build, because Sol AUTHORS NOTHING under this switch — no commit carries its trailer,
// so the author allowlist (scripts/model-guard-core.mjs), the `commit-msg` hook and the
// whole auditability machinery a role swap would need are untouched. The moment Sol
// authors, all of that becomes necessary; that is part B of the point and deliberately
// not built here.
//
// Side-effect free: reading and writing the file, and the printing, belong to
// scripts/sol-share.mjs. Pinned by sol-share-core.test.mjs.

import { KINDS as ASK_KINDS } from './ask-sol-core.mjs'
import { mainCheckoutFrom } from './review-sol-core.mjs'

/**
 * The three settings, ordered from the least Sol to the most. The order IS the
 * semantics: `--more` steps one to the right, `--less` one to the left, so a user who
 * only remembers "more OpenAI" never has to remember the names.
 */
export const SETTINGS = Object.freeze(['claude-only', 'default', 'prefer-sol'])

/** What the file says when nothing has been set — today's behaviour. */
export const DEFAULT_SETTING = 'default'

/**
 * What a file that EXISTS but cannot be read falls back to (cross-vendor review,
 * 12.08.2026).
 *
 * NOT the default. The default routes reviews to Sol, so a corrupted `claude-only` state
 * would quietly start spending the very allowance the operator had moved away from —
 * fail-open in the one direction this switch exists to prevent. A file that is there and
 * unusable is an anomaly, and the conservative reading of an anomaly is to spend nothing:
 * the work falls to the Claude chain, which is always reachable, and every consumer
 * PRINTS the problem so the state gets repaired instead of silently standing.
 *
 * A file that is simply ABSENT is not an anomaly — nothing was ever set — and stays at
 * the default.
 */
export const SAFE_SETTING = 'claude-only'

/** Where the setting lives, relative to the checkout that owns it. */
export const SETTING_FILE_NAME = 'sol-share.json'

/**
 * The setting's path, given git's common dir. PURE.
 *
 * In the MAIN checkout, never the throwaway worktree's — exactly where the saved ChatGPT
 * login lives and for the same reason: the switch is the machine's state, and a
 * delegated agent must read the SAME setting the user flipped, not a copy that vanishes
 * with its worktree.
 */
export function settingPathFrom(gitCommonDir, repoRoot, { sep = '/' } = {}) {
  return `${mainCheckoutFrom(gitCommonDir, repoRoot)}${sep}.claude${sep}${SETTING_FILE_NAME}`
}

/**
 * Every kind of work this switch has an opinion about.
 *
 * `review` is the four-eyes review that already goes to Sol (point 624); the others are
 * the read-only kinds `scripts/ask-sol.mjs` can carry. AUTHORING is deliberately absent:
 * it is not routable under part A at all, and a kind listed here that nothing can route
 * would be a promise the switch does not keep.
 */
export const KINDS = Object.freeze(['review', ...ASK_KINDS])

export const KIND_NOTES = Object.freeze({
  review: 'the four-eyes review of a diff (scripts/review-sol.mjs)',
  diagnose: 'name the cause of a red from log plus diff',
  audit: 'the enumerating plausibility and bug-finding sweeps',
  enumerate: 'risk, test-case and option lists (a blind-parallel half)',
  explain: 'what a subsystem does, where something is handled',
})

/**
 * What each setting routes where. The table is DATA rather than three `if`s because
 * every consumer — the command, the brief, the board note, the tests — reads the same
 * one, which is the point's "read this file rather than keeping their own copy".
 */
const ROUTING = Object.freeze({
  'claude-only': Object.freeze({ review: 'claude', diagnose: 'claude', audit: 'claude', enumerate: 'claude', explain: 'claude' }),
  default: Object.freeze({ review: 'sol', diagnose: 'claude', audit: 'claude', enumerate: 'claude', explain: 'claude' }),
  'prefer-sol': Object.freeze({ review: 'sol', diagnose: 'sol', audit: 'sol', enumerate: 'sol', explain: 'sol' }),
})

/** One line per setting, saying what it is FOR — printed by `--status` and by `--help`. */
export const SETTING_NOTES = Object.freeze({
  'claude-only': 'the escape hatch when the ChatGPT side is the scarce one — nothing goes to Sol',
  default: "today's behaviour: reviews to Sol, everything else to Claude",
  'prefer-sol': 'every read-only kind goes to Sol; Claude keeps authoring, the suites, the pictures and the landing',
})

/** WHAT IS NEVER ROUTED, whatever the setting says. Printed, so nobody has to ask. */
export const NEVER_ROUTED = Object.freeze([
  'authoring a commit — the trailer names an author, and only the allowlist may',
  'driving the browser suites and JUDGING the picture',
  'the landing (scripts/land-point.mjs) and the main session bookkeeping',
])

/** A value that is one of the three settings, or null. PURE. */
export function normaliseSetting(value) {
  const v = String(value ?? '').trim().toLowerCase()
  return SETTINGS.includes(v) ? v : null
}

/**
 * The setting a state file holds. PURE.
 *
 * NEVER throws and never guesses: an absent file is the DEFAULT, and a file that is there
 * but unusable is the SAFE setting with the problem NAMED (see SAFE_SETTING for why the
 * two differ). `corrupt` says which case it was, so a consumer can print the problem
 * rather than act on a state nobody chose.
 */
export function readSetting(raw) {
  const broken = (problem) => ({ setting: SAFE_SETTING, changedAt: null, changedBy: '', problem, corrupt: true })
  if (raw == null || raw === '') return { setting: DEFAULT_SETTING, changedAt: null, changedBy: '', problem: '', corrupt: false }
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return broken(`the state file is not JSON — falling back to \`${SAFE_SETTING}\`, which spends nothing`)
    }
  }
  const setting = normaliseSetting(parsed?.setting)
  if (!setting) {
    return broken(
      `"${String(parsed?.setting ?? '')}" is not one of ${SETTINGS.join(', ')} — falling back to ` +
        `\`${SAFE_SETTING}\`, which spends nothing`,
    )
  }
  return {
    setting,
    changedAt: Number.isFinite(Number(parsed?.changedAt)) && Number(parsed?.changedAt) > 0 ? Number(parsed.changedAt) : null,
    changedBy: String(parsed?.changedBy ?? ''),
    problem: '',
    corrupt: false,
  }
}

/** The state object to write for a setting. PURE. */
export function writeState(setting, { now = Date.now(), by = '' } = {}) {
  const value = normaliseSetting(setting)
  if (!value) throw new Error(`sol-share: not a setting: ${setting}`)
  return { setting: value, changedAt: now, changedBy: String(by ?? '') }
}

/**
 * One step along the ladder. PURE.
 *
 * At an end it says so rather than wrapping around: a `--more` that silently became
 * `claude-only` would move the load to exactly the vendor the user was trying to spare.
 */
export function step(setting, direction) {
  const from = normaliseSetting(setting) ?? DEFAULT_SETTING
  const delta = direction === 'more' ? 1 : direction === 'less' ? -1 : 0
  if (!delta) throw new Error(`sol-share: not a direction: ${direction}`)
  const i = SETTINGS.indexOf(from)
  const j = i + delta
  if (j < 0 || j >= SETTINGS.length) return { from, to: from, changed: false, atEnd: true }
  return { from, to: SETTINGS[j], changed: true, atEnd: false }
}

/** Where one kind of work goes under one setting: 'sol' or 'claude'. PURE. */
export function routeFor(kind, setting) {
  const table = ROUTING[normaliseSetting(setting) ?? DEFAULT_SETTING]
  return table[String(kind ?? '').trim().toLowerCase()] ?? 'claude'
}

/** The whole table for one setting, as [{ kind, to, note }]. PURE. */
export function routingTable(setting) {
  return KINDS.map((kind) => ({ kind, to: routeFor(kind, setting), note: KIND_NOTES[kind] }))
}

/** Are ANY of the read-only kinds routed to Sol under this setting? PURE. */
export function kindsToSol(setting) {
  return KINDS.filter((kind) => routeFor(kind, setting) === 'sol')
}

/** `--status` in ONE line: what goes where right now. PURE. */
export function statusLine(setting) {
  const value = normaliseSetting(setting) ?? DEFAULT_SETTING
  const sol = kindsToSol(value)
  const claude = KINDS.filter((kind) => !sol.includes(kind))
  const half = (label, list) => `${label}: ${list.length ? list.join(', ') : 'nothing'}`
  return `sol-share: ${value} — ${half('to GPT-5.6 Sol', sol)} · ${half('to Claude', claude)}`
}

/**
 * The line the DELEGATION BRIEF carries (point 654 A3), so a delegated agent asks Sol
 * for its diagnosis or its enumeration instead of doing it in its own context.
 *
 * It is one line at every setting, including the default: an agent that is never told
 * the lever exists cannot be blamed for not pulling it, and one line is what the brief
 * can afford.
 */
export function briefLine(setting) {
  const value = normaliseSetting(setting) ?? DEFAULT_SETTING
  if (value === 'prefer-sol') {
    return (
      `- SOL ROUTING is at \`prefer-sol\`: hand ${kindsToSol(value).filter((k) => k !== 'review').join('/')} to ` +
      '`node scripts/ask-sol.mjs --kind <kind> --brief "…"` (material on stdin) instead of doing it in your own\n' +
      '  context. You keep authoring, the gates, the suites and the pictures. Sol writes no commit.'
    )
  }
  if (value === 'claude-only') {
    return '- SOL ROUTING is at `claude-only`: the ChatGPT side is the scarce one — do NOT call `scripts/ask-sol.mjs`.'
  }
  return '- SOL ROUTING is at `default`: reviews go to GPT-5.6 Sol, everything else stays with you (`node scripts/sol-share.mjs --status`).'
}

/**
 * THE BOARD NOTE, in the board's own language, or '' at the default setting.
 *
 * It exists so nobody wonders why a diagnosis came back in another voice: while the
 * switch is off its default, the board says so. At the default it says nothing at all —
 * a note that is always there is a note nobody reads.
 */
export function boardNoteSegment(setting) {
  const value = normaliseSetting(setting) ?? DEFAULT_SETTING
  if (value === 'prefer-sol') return 'Sol-Routing: prefer-sol — Diagnose, Audit, Aufzählungen und Erklärungen laufen über GPT-5.6 Sol'
  if (value === 'claude-only') return 'Sol-Routing: claude-only — auch Reviews bleiben in der Claude-Kette'
  return ''
}

/** The footer segment marker: what an OLD note is recognised and removed by. PURE. */
const NOTE_MARK = /^Sol-Routing:/

/**
 * Put the current note into the board's footer, or take a stale one out. PURE.
 *
 * The footer is where it belongs: `refreshFooter` (scripts/board-core.mjs) keeps every
 * segment it does not own, so a note written once would otherwise survive for ever —
 * hence this function REMOVES any earlier note before adding the current one, and
 * removes without adding at the default setting. Unchanged html comes back identical,
 * so a publish does not rewrite the file for nothing.
 */
export function applyFooterNote(html, setting) {
  const text = String(html ?? '')
  const m = text.match(/<footer>([\s\S]*?)<\/footer>/)
  if (!m) return text
  const kept = m[1]
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s && !NOTE_MARK.test(s))
  const note = boardNoteSegment(setting)
  const segments = note ? [...kept, note] : kept
  const replacement = `<footer>${segments.join(' · ')}</footer>`
  return replacement === m[0] ? text : text.replace(m[0], replacement)
}
