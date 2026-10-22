// THE SWITCH THAT MOVES WORK BETWEEN THE MAIN CHAIN AND THE CROSS LANE (point 654,
// widened by 667). rule:model-policy@2f245cec
//
// WHY IT EXISTS: the user pays two vendors whose allowances run out at different times,
// and wants the load moved BEFORE one of them is nearly spent. It began as a read-only
// switch, which cost almost nothing to build because nothing the cross lane did carried a
// commit trailer. Point 667 then added the `author` kind, and with it the machinery a role
// swap needs — the cross lane stands in the author allowlist (scripts/model-guard-core.mjs),
// the `commit-msg` hook takes its trailer, and where the cross lane authored, the MAIN
// CHAIN reviews, runs the suites, judges the picture and lands.
//
// The switch says where work SHOULD go; it does not know whether the lane answers.
// An UNREACHABLE cross lane — an exhausted allowance included — authors on the main chain
// instead of waiting (user 23.09.2026); point 1194 makes that automatic, with a probe clock.
// Reachability itself is the owner's recorded probe, never a claim of this file.
//
// Route targets are lane roles, `cross` or `main`; model names come from
// scripts/model-lanes.mjs only.
//
// Side-effect free: reading and writing the file, and the printing, belong to
// scripts/lane-routing.mjs. Pinned by lane-routing-core.test.mjs.

import { KINDS as ASK_KINDS } from './ask-lane-core.mjs'
import { CROSS, LEGACY, MAIN, SCARCE, lane } from './model-lanes.mjs'
import { OUTAGE_OUTCOMES } from './cross-review-core.mjs'
import { mainCheckoutFrom } from './main-checkout-core.mjs'

/**
 * The three settings, ordered from the least cross-lane work to the most. The order IS the
 * semantics: `--more` steps one to the right, `--less` one to the left, so a user who
 * only remembers "more to the cross lane" never has to remember the names.
 * Writers emit only these; older spellings are read through LEGACY.routingSettings.
 */
export const SETTINGS = Object.freeze(['main-only', 'default', 'prefer-cross'])

/**
 * What an ABSENT file routes as — not the project's standing policy.
 *
 * The name is a file-format default, and the two are different things (cross-vendor
 * audit, 17.08.2026): the standing policy then had the cross lane authoring the points — the
 * hard and critical ones included — which only `prefer-cross` routes. A checkout that never set the switch therefore
 * runs BELOW the standing policy rather than at it — deliberately, because an unset file
 * spends the cross lane only on reviews and enumerate halves, never on authoring
 * nobody chose.
 */
export const DEFAULT_SETTING = 'default'

/**
 * What a file that EXISTS but cannot be read falls back to (cross-vendor review,
 * 12.08.2026), and what any value that is not a setting routes as.
 *
 * NOT the default. The default routes reviews and enumerate to the cross lane, so a corrupted `main-only` state
 * would quietly start spending the very allowance the operator had moved away from —
 * fail-open in the one direction a switch can fail open UNOBSERVED.
 *
 * IT IS NOT NEUTRAL, and the audit of 12.08.2026 was right to say so: a corrupted
 * `prefer-cross` state falls back to the vendor THAT operator was sparing. There is no
 * setting that spends nothing on both, so the honest claim is the narrow one — the
 * fallback sends nothing to the SECOND vendor, and the work stays where it would be
 * without the switch at all, in the session that is already running. That is recoverable
 * and visible; the other direction spends an allowance nobody authorised. Every consumer
 * PRINTS the problem, so a fallback is repaired rather than lived with.
 *
 * A file that is simply ABSENT is not an anomaly — nothing was ever set — and stays at
 * the default.
 */
export const SAFE_SETTING = 'main-only'

/**
 * The setting a value is TREATED as. PURE.
 *
 * One rule everywhere: a value that is not one of the three is an anomaly, and an anomaly
 * is read as the safe setting. It used to fall back to the default, which routes reviews and enumerate
 * to the cross lane — so a garbled setting spent the second vendor's allowance (audit, 12.08.2026).
 */
export function settingOrSafe(value) {
  return normaliseSetting(value) ?? SAFE_SETTING
}

/**
 * The SETTING AND WHETHER IT IS A FALLBACK, from either a bare setting or a whole state
 * object. PURE.
 *
 * Everything that SPEAKS about the setting takes the state rather than the setting plus a
 * flag (fourth cross-vendor round): a separate flag is a thing a caller can forget, and a
 * forgotten one presents a fallback as the operator's choice — which is exactly the
 * defect the flag was added to fix. With one object there is nothing to forget.
 */
function asState(value, now = Date.now()) {
  return value && typeof value === 'object'
    ? { setting: settingOrSafe(value.setting), corrupt: Boolean(value.corrupt), fallback: activeFallback(value, now) }
    : { setting: settingOrSafe(value), corrupt: false, fallback: null }
}

/** Where the setting lives, relative to the checkout that owns it. */
const SETTING_FILE_NAME = 'lane-routing.json'

/** The file the setting lived in before: read when the new one is absent, never rewritten. */
export const LEGACY_SETTING_FILE_NAME = LEGACY.files.routing

/**
 * The setting's path, given git's common dir. PURE.
 *
 * In the MAIN checkout, never the throwaway worktree's — exactly where the cross lane's saved
 * login lives and for the same reason: the switch is the machine's state, and a
 * delegated agent must read the SAME setting the user flipped, not a copy that vanishes
 * with its worktree.
 */
export function settingPathFrom(gitCommonDir, repoRoot, { sep = '/' } = {}) {
  const owner = mainCheckoutFrom(gitCommonDir, repoRoot) ?? String(repoRoot ?? '')
  return `${owner}${sep}.claude${sep}${SETTING_FILE_NAME}`
}

/**
 * Every kind of work this switch has an opinion about.
 *
 * `review` is the four-eyes review that already goes to the cross lane (point 624), the middle ones
 * are the read-only kinds `scripts/ask-lane.mjs` can carry, and `author` is the writing
 * lane of point 667 — deliberately absent while nothing could route it, and added the
 * moment `scripts/author-delegate.mjs` existed to. It matters most: authoring is the largest
 * single item of the spend, so the switch that exists to move load between the two lanes
 * would be missing its biggest lever without it.
 */
export const KINDS = Object.freeze(['review', ...ASK_KINDS, 'author'])

/** The kinds `scripts/ask-lane.mjs` carries (review has its own command). */
const READ_ONLY_KINDS = Object.freeze([...ASK_KINDS])

export const KIND_NOTES = Object.freeze({
  review: 'the four-eyes review of a diff (scripts/cross-review.mjs)',
  diagnose: 'name the cause of a red from log plus diff',
  audit: 'the enumerating plausibility and bug-finding sweeps',
  enumerate: 'risk, test-case and option lists (a blind-parallel half)',
  explain: 'what a subsystem does, where something is handled',
  author: 'authoring a point, the hard and critical ones included (scripts/author-delegate.mjs)',
})

/**
 * What each setting routes where. The table is DATA rather than three `if`s because
 * every consumer — the command, the brief, the board note, the tests — reads the same
 * one, which is the point's "read this file rather than keeping their own copy".
 */
const ROUTING = Object.freeze({
  'main-only': Object.freeze({ review: 'main', diagnose: 'main', audit: 'main', enumerate: 'main', explain: 'main', author: 'main' }),
  default: Object.freeze({ review: 'cross', diagnose: 'main', audit: 'main', enumerate: 'cross', explain: 'main', author: 'main' }),
  'prefer-cross': Object.freeze({ review: 'cross', diagnose: 'cross', audit: 'cross', enumerate: 'cross', explain: 'cross', author: 'cross' }),
})

/** One line per setting, saying what it is FOR — printed by `--status` and by `--help`. */
export const SETTING_NOTES = Object.freeze({
  'main-only': "the escape hatch when the cross lane's allowance is the short one — nothing goes to the cross lane",
  default: 'reviews and enumerate to the cross lane; diagnose, audit, explain and author to the main chain',
  'prefer-cross': 'every read-only kind AND the authoring of every point the cut does not keep here — the hard and critical ones included — goes to the cross lane; the main chain reviews it, runs the suites, judges the picture and lands',
})

/** WHAT IS NEVER ROUTED, whatever the setting says. Printed, so nobody has to ask. */
export const NEVER_ROUTED = Object.freeze([
  'a point whose VERIFICATION is the work, unless its spec marks it hard or names a lane (scripts/author-routing-core.mjs decides)',
  'REVIEWING what the cross lane itself authored — no model reviews its own work',
  'driving the browser suites and JUDGING the picture',
  'the landing (scripts/land-point.mjs) and the main session bookkeeping',
])

/** The largest instant a JS `Date` can represent — beyond it `toISOString()` throws. */
const MAX_TIMESTAMP = 8.64e15

/** A value that is one of the three settings, or null. PURE. The writers' gate: new spellings only. */
export function normaliseSetting(value) {
  const v = String(value ?? '').trim().toLowerCase()
  return SETTINGS.includes(v) ? v : null
}

/** A STORED value as a setting, an older spelling read through LEGACY.routingSettings. PURE. */
function storedSetting(value) {
  const v = String(value ?? '').trim().toLowerCase()
  return normaliseSetting(LEGACY.routingSettings[v] ?? v)
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
  // ONLY `null` (or undefined) IS "no file" — the caller passes it when nothing exists. An EMPTY string
  // is a file that is there and says nothing, which is what a torn write leaves behind
  // (audit, 12.08.2026): reading it as "never set" would resume spending on a state the
  // operator had chosen.
  if (raw == null) return { setting: DEFAULT_SETTING, changedAt: null, changedBy: '', problem: '', corrupt: false }
  if (typeof raw === 'string' && !raw.trim()) {
    return broken(`the state file is EMPTY (a torn write?) — falling back to \`${SAFE_SETTING}\``)
  }
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return broken(`the state file is not JSON — falling back to \`${SAFE_SETTING}\`, which sends nothing to the cross lane`)
    }
  }
  const setting = storedSetting(parsed?.setting)
  if (!setting) {
    return broken(
      `"${String(parsed?.setting ?? '')}" is not one of ${SETTINGS.join(', ')} — falling back to ` +
        `\`${SAFE_SETTING}\`, which sends nothing to the cross lane`,
    )
  }
  // A TIMESTAMP A Date CAN HOLD, or none (audit, 12.08.2026): `1e300` is finite and
  // positive, and `new Date(1e300).toISOString()` THROWS — which would take down the
  // status report of a switch whose whole promise is that it cannot break its caller.
  const at = Number(parsed?.changedAt)
  return {
    setting,
    changedAt: Number.isFinite(at) && at > 0 && at <= MAX_TIMESTAMP ? at : null,
    changedBy: String(parsed?.changedBy ?? ''),
    problem: '',
    corrupt: false,
    fallback: readFallback(parsed?.fallback),
  }
}

/** The state object to write for a setting. PURE. */
export function writeState(setting, { now = Date.now(), by = '', fallback = null } = {}) {
  const value = normaliseSetting(setting)
  if (!value) throw new Error(`lane-routing: not a setting: ${setting}`)
  const kept = readFallback(fallback)
  return { setting: value, changedAt: now, changedBy: String(by ?? ''), ...(kept ? { fallback: kept } : {}) }
}

// THE MEASURED OUTAGE FALLBACK (point 1194). The setting is the operator's; this is an
// override on top of it, written only when a routed cross-lane run FAILED on a vendor-limit
// or unreachable signature, and carrying a probe clock. While the clock runs every kind is
// served by the main chain — the main lane authors, and four eyes uses the decorrelated
// same-vendor pair (the scarce lane reads main-lane work). When it runs out, routing returns to the setting
// and the next routed run is the probe: a success clears the record, the same signature
// renews it. An ordinary failure is never a fallback — it stays the point's red.

/** The classified outcomes that are a VENDOR outage — its own signature set. */
export const OUTAGE_KINDS = OUTAGE_OUTCOMES

/** How long a recorded outage keeps routing off the cross lane before the next probe. Calibratable. */
export const OUTAGE_PROBE_MS = 30 * 60 * 1000

/** The models serving under the fallback, named once for every consumer. */
export const FALLBACK_AUTHOR = MAIN.displayName
const FALLBACK_REVIEWER = SCARCE.displayName

/** A fallback record as stored, or null when it is malformed. PURE. */
function readFallback(value) {
  if (!value || typeof value !== 'object') return null
  const since = Number(value.since)
  const probeAt = Number(value.probeAt)
  const ok = (n) => Number.isFinite(n) && n > 0 && n <= MAX_TIMESTAMP
  if (!ok(since) || !ok(probeAt) || !OUTAGE_KINDS.includes(value.outage)) return null
  return {
    outage: value.outage,
    signature: String(value.signature ?? '').slice(0, 200),
    kind: String(value.kind ?? ''),
    since,
    probeAt,
    probes: Number.isInteger(value.probes) && value.probes > 0 ? value.probes : 1,
  }
}

/** The fallback in force at `now`, or null — an expired probe clock routes by the setting. PURE. */
function activeFallback(state, now = Date.now()) {
  const fb = readFallback(state?.fallback)
  return fb && fb.probeAt > now ? fb : null
}

/** The last non-empty line of a failed run that names its outage, for the record. PURE. */
function signatureLine(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
  return (lines.at(-1) ?? '').slice(0, 200)
}

/**
 * The fallback record after one routed run of the lane `role`. PURE.
 *
 * `outcome` is cross-review-core's classifyOutcome; `text` the run's stderr and stdout.
 * Returns { fallback, fellBack }: a success lifts any record, an outage records or
 * renews one with a fresh probe clock, and every other failure leaves the record as it
 * was and is NOT a fallback. The record is the CROSS lane's — the only lane this switch
 * routes away from the main chain — so a run of another lane leaves it as it was.
 */
export function afterLaneRun({ role = 'cross', outcome = {}, text = '', kind = '', previous = null, now = Date.now(), probeMs = OUTAGE_PROBE_MS } = {}) {
  const prior = readFallback(previous)
  if (lane(role).role !== 'cross') return { fallback: prior, fellBack: false }
  if (outcome.ok) return { fallback: null, fellBack: false }
  if (!OUTAGE_KINDS.includes(outcome.kind)) return { fallback: prior, fellBack: false }
  return {
    fellBack: true,
    fallback: {
      outage: outcome.kind,
      signature: signatureLine(text) || String(outcome.cause ?? '').slice(0, 200),
      kind: String(kind ?? ''),
      since: prior ? prior.since : now,
      probeAt: now + probeMs,
      probes: prior ? prior.probes + 1 : 1,
    },
  }
}

/**
 * Where one kind goes NOW: the setting's route (`cross` or `main`), overridden to the main
 * chain while a fallback is active. PURE. Returns { to, fallback } — `fallback` is the record that moved it, or null.
 */
export function effectiveRoute(kind, state, now = Date.now()) {
  const fallback = activeFallback(state, now)
  const to = routeFor(kind, asState(state, now).setting)
  return to === 'cross' && fallback ? { to: 'main', fallback } : { to, fallback: null }
}

/** The one sentence every consumer prints for an active fallback, or ''. PURE. */
export function fallbackLine(state, now = Date.now()) {
  const fb = activeFallback(state, now)
  if (!fb) return ''
  return (
    `FALLBACK ACTIVE — ${CROSS.displayName} ${fb.outage} since ${new Date(fb.since).toISOString()} ("${fb.signature}"): ` +
    `every kind is served by the main chain (${FALLBACK_AUTHOR} authors; four eyes is the same-vendor pair, ` +
    `${FALLBACK_REVIEWER} reads ${FALLBACK_AUTHOR} work, recorded as a fallback) until the probe at ` +
    `${new Date(fb.probeAt).toISOString()}; the operator setting \`${asState(state, now).setting}\` stays`
  )
}

/** The review hand-over cause under the fallback — the record says it was one. PURE. */
export function fallbackReviewCause(fb) {
  return (
    `cross-lane outage FALLBACK (${fb?.outage ?? 'outage'}: "${fb?.signature ?? ''}") — four eyes on the ` +
    `decorrelated same-vendor pair, ${FALLBACK_REVIEWER} reading ${FALLBACK_AUTHOR} work`
  )
}

/**
 * One step along the ladder. PURE.
 *
 * At an end it says so rather than wrapping around: a `--more` that silently became
 * `main-only` would move the load to exactly the vendor the user was trying to spare.
 */
export function step(setting, direction) {
  const from = settingOrSafe(setting)
  const delta = direction === 'more' ? 1 : direction === 'less' ? -1 : 0
  if (!delta) throw new Error(`lane-routing: not a direction: ${direction}`)
  const i = SETTINGS.indexOf(from)
  const j = i + delta
  if (j < 0 || j >= SETTINGS.length) return { from, to: from, changed: false, atEnd: true }
  return { from, to: SETTINGS[j], changed: true, atEnd: false }
}

/** Where one kind of work goes under one setting: the lane role 'cross' or 'main'. PURE. */
export function routeFor(kind, setting) {
  const table = ROUTING[settingOrSafe(setting)]
  return table[String(kind ?? '').trim().toLowerCase()] ?? 'main'
}

/** The whole table for one setting, as [{ kind, to, note }]. PURE. */
export function routingTable(setting) {
  return KINDS.map((kind) => ({ kind, to: routeFor(kind, setting), note: KIND_NOTES[kind] }))
}

/** Every kind routed to the lane `role` under this setting. PURE. Throws on an unknown role. */
export function kindsToLane(role, setting) {
  const wanted = lane(role).role
  return KINDS.filter((kind) => routeFor(kind, setting) === wanted)
}

/** How a route target is spoken of: the cross lane by its model, the main chain by role. PURE. */
export function routeLabel(to) {
  return to === 'cross' ? CROSS.displayName : 'the main chain'
}

/** `--status` in ONE line: what goes where right now. PURE. */
export function statusLine(state, now = Date.now()) {
  const { setting: value, fallback } = asState(state, now)
  const cross = fallback ? [] : kindsToLane('cross', value)
  const main = KINDS.filter((kind) => !cross.includes(kind))
  const half = (to, list) => `to ${routeLabel(to)}: ${list.length ? list.join(', ') : 'nothing'}`
  const mark = fallback ? ` (outage FALLBACK until ${new Date(fallback.probeAt).toISOString()})` : ''
  return `lane-routing: ${value}${mark} — ${half('cross', cross)} · ${half('main', main)}`
}

/**
 * The line the DELEGATION BRIEF carries (point 654 A3), so a delegated agent asks the cross
 * lane for the read-only work its setting routes there instead of doing it in its own context.
 *
 * It is present at every setting, including the default: an agent that is never told
 * the lever exists cannot be blamed for not pulling it. It stays short (prefer-cross
 * wraps to two lines), which is what the brief can afford.
 */
export function briefLine(state) {
  const { setting: value, corrupt, fallback } = asState(state)
  if (fallback) {
    return `- LANE ROUTING: ${fallbackLine(state)} — do NOT call \`scripts/ask-lane.mjs\`.`
  }
  // A FALLBACK SAYS IT IS ONE (audit, 12.08.2026). Presented bare, a safe setting reads
  // as the operator's choice, and nobody repairs the file it actually came from.
  const mark = corrupt ? ' (FALLBACK — the share state file is unusable; repair it with `node scripts/lane-routing.mjs --set <setting>`)' : ''
  if (value === 'prefer-cross') {
    // The brief speaks to a DELEGATED agent, which is authoring already — so it is told
    // about the reading kinds it can hand over, not about the authoring lane it is in.
    return (
      `- LANE ROUTING is at \`prefer-cross\`: hand ${kindsToLane('cross', value).filter((k) => READ_ONLY_KINDS.includes(k)).join('/')} to ` +
      '`node scripts/ask-lane.mjs --lane cross --kind <kind> --brief "…"` (material on stdin) instead of doing it in your own\n' +
      `  context. You keep the gates, the suites and the pictures; a read-only ask writes no commit.${mark}`
    )
  }
  if (value === 'main-only') {
    return `- LANE ROUTING is at \`main-only\`: the cross lane's allowance is the short one — do NOT call \`scripts/ask-lane.mjs\`.${mark}`
  }
  return `- LANE ROUTING is at \`default\`: reviews and enumerate go to the cross lane (${CROSS.displayName}); hand blind-parallel enumerate halves to \`node scripts/ask-lane.mjs --lane cross --kind enumerate --brief "…"\` (material on stdin). Diagnose, audit, explain and author stay with the main chain; a blind audit half uses \`--anyway\`.${mark}`
}

/**
 * THE BOARD NOTE, in the board's own language, or '' at the default setting with no
 * active outage fallback.
 *
 * It exists so nobody wonders why a diagnosis came back in another voice: while the
 * switch is off its default, or a fallback is active, the board says so. Otherwise it
 * says nothing at all — a note that is always there is a note nobody reads.
 */
export function boardNoteSegment(state) {
  const { setting: value, corrupt, fallback } = asState(state)
  if (fallback) {
    return (
      `Lane-Routing: Ausfall-Rückfall (${fallback.outage}) — alles läuft in der Hauptkette, ${FALLBACK_AUTHOR} ` +
      `schreibt, ${FALLBACK_REVIEWER} prüft; nächste Probe ${new Date(fallback.probeAt).toISOString().slice(11, 16)} UTC, ` +
      `Einstellung bleibt ${value}`
    )
  }
  // A fallback is named as one here too — on the board the reader is the user, and the
  // difference between "I set this" and "the file is broken" is the whole message.
  const mark = corrupt ? ' (Notfall-Rückfall: die Einstellungsdatei ist unlesbar)' : ''
  if (value === 'prefer-cross') return `Lane-Routing: prefer-cross — Reviews, Autorschaft, Diagnose, Audit, Aufzählungen und Erklärungen laufen über ${CROSS.displayName}${mark}`
  if (value === 'main-only') return `Lane-Routing: main-only — auch Reviews bleiben in der Hauptkette${mark}`
  return ''
}

/** The footer segment marker: what an OLD note is recognised and removed by — any
 *  `<Word>-Routing:` segment, so a note written under an earlier label goes too. PURE. */
const NOTE_MARK = /^[A-Za-z]+-Routing:/

/**
 * Put the current note into the board's footer, or take a stale one out. PURE.
 *
 * The footer is where it belongs: `refreshFooter` (scripts/board-core.mjs) keeps every
 * segment it does not own, so a note written once would otherwise survive for ever —
 * hence this function REMOVES any earlier note before adding the current one, and
 * removes without adding when there is no note. An already-normalised footer with an
 * unchanged note comes back identical, so a publish does not rewrite the file for nothing.
 */
export function applyFooterNote(html, state) {
  const text = String(html ?? '')
  const m = text.match(/<footer>([\s\S]*?)<\/footer>/)
  if (!m) return text
  const kept = m[1]
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s && !NOTE_MARK.test(s))
  const note = boardNoteSegment(state)
  const segments = note ? [...kept, note] : kept
  const replacement = `<footer>${segments.join(' · ')}</footer>`
  return replacement === m[0] ? text : text.replace(m[0], replacement)
}
