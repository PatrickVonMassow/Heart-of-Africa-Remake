// Pure half of the board's slot line (user order 11.11.2026): on its own line
// below the heading "Woran ich gerade arbeite" (12.11.2026, a plain block since
// point 1518) the board ALWAYS says why fewer than POOL_CAP points
// are worked in parallel. Every phrase is derived from measured facts; where no
// reason can be measured the line says "Grund nicht messbar" and the I/O half
// files a finding — never filler, never agent-written free text (point 1452).
import { POOL_CAP, slotReasonDecision } from './batch-in-flight-core.mjs'

/** The visible marker for a state no measurement explains. */
export const UNMEASURABLE_TEXT = 'Grund nicht messbar'

/** The finding title filed when the line shows `UNMEASURABLE_TEXT`. */
export const UNMEASURABLE_FINDING_TITLE = 'Board: Grund für ungenutzte Pool-Slots nicht messbar'

/** The class of the span the line lives in, inside the section's <summary>. */
export const SLOTS_CLASS = 'slots'

const NOW_HEADING = '<summary><h2>Woran ich gerade arbeite</h2>'
const SLOTS_SPAN_SOURCE = `<span class="${SLOTS_CLASS}">[^<]*</span>`
const NOW_SUMMARY_RE = new RegExp(`${NOW_HEADING}(?:${SLOTS_SPAN_SOURCE})?</summary>`)

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/** "ruht seit 10 Tagen" from a measured tip age; null age is said as such. */
export function idleLabel(ageMs) {
  if (!Number.isFinite(ageMs)) return 'ruht, Alter nicht messbar'
  if (ageMs >= DAY_MS) {
    const days = Math.floor(ageMs / DAY_MS)
    return `ruht seit ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
  }
  const hours = Math.floor(ageMs / HOUR_MS)
  if (hours >= 1) return `ruht seit ${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`
  return 'ruht seit weniger als 1 Stunde'
}

/** The measured state of one slot-holding branch nobody works on. */
function blockerState(branch, { openPoints, closedPoints }) {
  if (branch.point == null) return 'kein Punkt zuordenbar'
  if (closedPoints.has(branch.point)) return 'erledigt, Branch nicht gelöscht'
  if (!openPoints.has(branch.point)) return 'Punkt nicht im Arbeitsauftrag'
  return idleLabel(branch.ageMs)
}

/** "1341, 1482 (erledigt, Branch nicht gelöscht) · 1463 (ruht seit 10 Tagen)". */
function blockerText(blockers) {
  const groups = new Map()
  for (const b of blockers) {
    const label = b.point == null ? b.ref : String(b.point)
    if (!groups.has(b.state)) groups.set(b.state, [])
    const list = groups.get(b.state)
    if (!list.includes(label)) list.push(label)
  }
  return [...groups].map(([state, labels]) => `${labels.join(', ')} (${state})`).join(' · ')
}

/** "00:41" in Berlin time, the board's clock. */
function berlinClock(ms) {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(ms))
}

/**
 * The batch owner's measured state as a reason (point 1518), or null where the
 * owner state names none: no live owner, or a declared wait on the lock.
 */
function ownerReason(owner) {
  if (!owner || typeof owner !== 'object') return null
  if (owner.alive === false) return 'keine Batch-Session aktiv'
  const { waitAt, waitUntil } = owner
  if (owner.alive === true && Number.isFinite(waitAt) && Number.isFinite(waitUntil)) {
    return `Batch-Session wartet seit ${berlinClock(waitAt)} (bis ${berlinClock(waitUntil)})`
  }
  return null
}

/**
 * The free-slot reason, from the same decision batch-in-flight uses for the slot
 * question (`slotReasonDecision`). A reason that would otherwise read
 * unmeasurable is first explained by the owner state, then by active branches
 * without own commits. Returns { text, unmeasurable }.
 */
function freeSlotReason({ decision, specs, active, runningFiles, owner, freshActive }) {
  const base = baseFreeSlotReason({ decision, specs, active, runningFiles })
  if (!base.unmeasurable || ['branches-unreadable', 'record-unreadable'].includes(decision.why)) return base
  const byOwner = ownerReason(owner)
  if (byOwner) return { text: byOwner, unmeasurable: false }
  const fresh = (freshActive ?? []).filter((p) => active.includes(p))
  if (active.length > 0 && runningFiles.length === 0 && fresh.length > 0) {
    return { text: `${fresh.join(', ')} hat noch keine Commits, Unabhängigkeit erst danach prüfbar`, unmeasurable: false }
  }
  return base
}

function baseFreeSlotReason({ decision, specs, active, runningFiles }) {
  const unmeasurable = (cause) => ({ text: `${UNMEASURABLE_TEXT} (${cause})`, unmeasurable: true })
  switch (decision.why) {
    case 'paused':
      return { text: 'Batch pausiert', unmeasurable: false }
    case 'closing-freeze':
      return { text: 'Abschluss läuft, Code eingefroren', unmeasurable: false }
    case 'branches-unreadable':
      return unmeasurable('Branch-Liste nicht lesbar')
    case 'record-unreadable':
      return unmeasurable('Park-Liste nicht lesbar')
    default:
      break
  }
  if (decision.candidates.length > 0) {
    // Running work whose files could not be read makes every point look
    // independent; that is no measurement of independence.
    if (active.length > 0 && runningFiles.length === 0) return unmeasurable('Dateien der laufenden Arbeit nicht lesbar')
    const ready = decision.candidates.slice(0, 5).map((c) => c.point).join(', ')
    return unmeasurable(`unabhängig bereit: ${ready}`)
  }
  // `specs` holds only the points no slot or active work already covers.
  if (specs.length === 0) return { text: 'kein weiterer offener Punkt', unmeasurable: false }
  if (specs.every((p) => p.gated)) return { text: 'alle offenen Punkte warten auf deine Entscheidung', unmeasurable: false }
  if (!specs.some((p) => !p.gated && p.files.length > 0)) {
    return { text: 'kein offener Punkt nennt seine Dateien, Unabhängigkeit nicht prüfbar', unmeasurable: false }
  }
  if (active.length === 0) return unmeasurable('keine laufende Arbeit, kein Kandidat')
  return { text: `kein offener Punkt unabhängig von ${active.join(', ')}`, unmeasurable: false }
}

/**
 * The slot line. PURE.
 *
 * Input, all measured at render time:
 * - `branches`: the slot-holding branches, `openBranchSlots(...).open`
 *   ([{ ref, point, ageMs }], parked already excluded, local/origin folded);
 * - `branchesReadable`, `recordReadable`: whether that census could be read;
 * - `activePoints`: the points in active work (the now-section's source);
 * - `openPoints` / `closedPoints`: the work order's open and closed numbers;
 * - `specs`: `openPointSpecs(tasksText)`;
 * - `runningFiles`: the files the actively worked branches touch;
 * - `paused`, `closingFreeze`, `cap`;
 * - `owner`: the batch owner, { alive, waitAt?, waitUntil? } (waitAt/waitUntil
 *   only for a running declared wait), or null where unmeasured;
 * - `freshActive`: active points whose branch has no commit of its own beyond main.
 *
 * Returns { text, unmeasurable }.
 */
export function slotLine({
  branches = [],
  branchesReadable = true,
  recordReadable = true,
  activePoints = [],
  openPoints = [],
  closedPoints = [],
  specs = [],
  runningFiles = [],
  paused = false,
  closingFreeze = false,
  cap = POOL_CAP,
  owner = null,
  freshActive = [],
} = {}) {
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : POOL_CAP
  if (branchesReadable !== true || recordReadable !== true) {
    const cause = branchesReadable !== true ? 'Branch-Liste nicht lesbar' : 'Park-Liste nicht lesbar'
    return { text: `Slotbelegung nicht messbar: ${UNMEASURABLE_TEXT} (${cause})`, unmeasurable: true }
  }
  const active = [...new Set((activePoints ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]
  const activeSet = new Set(active)
  const open = new Set([...(openPoints ?? [])].map(Number))
  const closed = new Set([...(closedPoints ?? [])].map(Number))
  const list = Array.isArray(branches) ? branches : []
  const blockers = list
    .filter((b) => !(b.point != null && activeSet.has(b.point)))
    .map((b) => ({ ...b, state: blockerState(b, { openPoints: open, closedPoints: closed }) }))
  const free = Math.max(0, limit - list.length)
  if (free === 0 && blockers.length === 0) return { text: `${limit}/${limit} Slots in Arbeit`, unmeasurable: false }

  // A point that already holds a slot is no new candidate for a free one.
  const holding = new Set(list.map((b) => b.point).filter((p) => p != null))
  const candidateSpecs = (Array.isArray(specs) ? specs : [])
    .filter((p) => !holding.has(p.point) && !activeSet.has(p.point))
    .map((p) => ({ ...p, files: Array.isArray(p.files) ? p.files : [] }))
  const parts = [`${free}/${limit} Slots frei`]
  let unmeasurable = false
  if (free > 0) {
    const decision = slotReasonDecision({
      openBranches: list.length,
      branchesReadable: true,
      recordReadable: true,
      openPoints: candidateSpecs,
      runningFiles,
      paused,
      closingFreeze,
      cap: limit,
    })
    const fresh = [...(freshActive ?? [])].map(Number)
    const reason = freeSlotReason({ decision, specs: candidateSpecs, active, runningFiles, owner, freshActive: fresh })
    parts[0] += `: ${reason.text}`
    unmeasurable = reason.unmeasurable
  }
  if (blockers.length > 0) parts.push(`blockiert durch: ${blockerText(blockers)}`)
  return { text: parts.join(' · '), unmeasurable }
}

/** Markup-safe text for the span. */
function escapeText(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Write the slot line into the now-section's summary, after the heading (the
 * board CSS breaks it onto its own line), replacing any earlier one. A null/empty text removes it. A board without the heading is
 * returned unchanged. PURE.
 */
export function applySlotLine(html, text) {
  const source = String(html ?? '')
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim()
  const span = clean ? `<span class="${SLOTS_CLASS}">${escapeText(clean)}</span>` : ''
  // A callback, so `$&`, `$'` and the like in a branch name stay literal text.
  return source.replace(NOW_SUMMARY_RE, () => `${NOW_HEADING}${span}</summary>`)
}

/** The slot line currently shown, unescaped, or null. PURE. */
export function readSlotLine(html) {
  const m = String(html ?? '').match(new RegExp(`${NOW_HEADING}<span class="${SLOTS_CLASS}">([^<]*)</span></summary>`))
  return m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : null
}
