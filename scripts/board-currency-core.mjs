// Pure core of the BOARD-CURRENCY chain (point 400). Side-effect free, so the
// Vitest layer can sweep every rule without a filesystem, a git remote or a
// network (scripts/board-currency-core.test.mjs).
//
// WHY THIS EXISTS. Three cards were missing from the published board for up to
// 25 minutes while the user was reading it, and the flagship mode is worse than
// that: the headless successor session (`claude -p`, spawned by the OS launcher)
// had no way to publish, so on 28.07.2026 it edited the board and recorded a
// deferral. In that mode the board could not be updated AT ALL.
//
// The LEGACY (claude.ai artifact, retired 29.07.2026) mirror survives here in
// exactly two places — `publishedHash` and `artifactToolSeen` — so that an old
// record still counts and never re-blocks a board that was live. Nothing writes
// them any more; the transport below is what every session runs.
//
// The chain this module serves, in the order it was built:
//   A  the DUE MARK — the open-point set is hashed after every tool call and a
//      CHANGE sets `publishDue` in dashboard-state.json (persisted, so a session
//      that dies between the change and the publish hands the mark on).
//   B  the DENY — board-first-guard refuses the first state-changing call while
//      a publish is due, but only where a publish is actually POSSIBLE.
//   D  the TRANSPORT — the board is pushed to a branch of this repository and
//      read back over plain HTTPS, which a headless session can do and a
//      verification can check against the PAGE rather than a state record.
//   E  the WATCHDOG — the launcher fetches the live board and says so when it
//      is behind, which is the only layer that still speaks when the session
//      itself is wedged.
import { createHash } from 'node:crypto'
import {
  parseKlaerungPoints,
  parseNowCardPoints,
  parseQueuePoints,
  parseTasks,
} from './dashboard-guard-core.mjs'

// ── The transport (delta D) ────────────────────────────────────────────────
// The board lives on its OWN branch of this repository, never on `main`: a
// publish must not appear in the source history, must not trigger CI (which
// watches `main` and `feat/**`) and must not trigger the Pages deploy (which
// rebuilds the game AND every frozen version tag — minutes of runner time for a
// status card). The branch carries ONE orphan commit that is force-updated, so
// the history never grows either.
export const BOARD_OWNER = 'PatrickVonMassow'
export const BOARD_REPO = 'Heart-of-Africa-Remake'
export const BOARD_BRANCH = 'board'
export const BOARD_FILE = 'board.html'
export const ARCHIVE_FILE = 'archive.html'

/** The git ref the publisher writes. */
export const BOARD_REF = `refs/heads/${BOARD_BRANCH}`

/** Plain HTTPS, no auth, CORS-open: what the watchdog and the viewer read. */
export const BOARD_CONTENT_URL = `https://raw.githubusercontent.com/${BOARD_OWNER}/${BOARD_REPO}/${BOARD_BRANCH}/${BOARD_FILE}`
export const ARCHIVE_CONTENT_URL = `https://raw.githubusercontent.com/${BOARD_OWNER}/${BOARD_REPO}/${BOARD_BRANCH}/${ARCHIVE_FILE}`

/** What the USER opens: a viewer page on the Pages deploy this repo already runs. */
export const BOARD_PAGE_URL = `https://${BOARD_OWNER.toLowerCase()}.github.io/${BOARD_REPO}/board/`

/**
 * The floor of "current" (delta D sub-decision). raw.githubusercontent answers
 * with `cache-control: max-age=300`, so a reader can legitimately see content up
 * to five minutes old even though the push itself lands in seconds. The
 * verification must TOLERATE that rather than flap on it: only a board behind by
 * more than this counts as behind. A cache-busting query usually beats the TTL,
 * which is why the grace is the ceiling and not the expectation.
 */
export const LIVE_GRACE_MS = 6 * 60 * 1000

/** The launcher's tick — one tick of patience. */
export const WATCHDOG_TICK_MS = 15 * 60 * 1000

// ── The fingerprint (deltas A + E) ─────────────────────────────────────────

/** The meta the published board carries so a fetched page can be compared. */
export const FINGERPRINT_META = 'hoa-board-open'

/** Sorted, unique, positive integers — the canonical form of an open-point set. */
export function normaliseOpenSet(open) {
  const list = Array.isArray(open) ? open : []
  const seen = new Set()
  for (const raw of list) {
    const n = Number(raw)
    if (Number.isInteger(n) && n > 0) seen.add(n)
  }
  return [...seen].sort((a, b) => a - b)
}

/**
 * A short, stable fingerprint of the open-point SET. Order-independent by
 * construction (the set is normalised first), so a reordered work order does not
 * demand a republish while an added, removed or ticked point does.
 */
export function openSetFingerprint(open) {
  const canonical = normaliseOpenSet(open).join(',')
  return `sha256:${createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`
}

/**
 * THE fingerprint, derived from ONE source. The due mark (delta A) and the
 * record a publish leaves behind (delta B) MUST read the same text: derive one
 * from TASKS.md and the other from TASKS.md plus the archive and a publish would
 * re-arm the very mark it just cleared — the block loop this whole design exists
 * to prevent. Every caller goes through here rather than parsing for itself.
 */
export function openFingerprintOfTasks(tasksText) {
  return openSetFingerprint(parseTasks(String(tasksText ?? '')).open)
}

/** Write (or replace) the fingerprint meta in a board document. Idempotent. */
export function stampFingerprint(html, fingerprint) {
  const doc = typeof html === 'string' ? html : ''
  const fp = String(fingerprint ?? '')
  const tag = `<meta name="${FINGERPRINT_META}" content="${fp}">`
  const existing = new RegExp(`<meta name="${FINGERPRINT_META}" content="[^"]*">\\n?`)
  if (existing.test(doc)) return doc.replace(existing, `${tag}\n`)
  const titleEnd = doc.indexOf('</title>')
  if (titleEnd < 0) return `${tag}\n${doc}`
  const at = titleEnd + '</title>'.length
  return `${doc.slice(0, at)}\n${tag}${doc.slice(at)}`
}

/** The fingerprint a board document carries, or null. */
export function readFingerprint(html) {
  const m = String(html ?? '').match(new RegExp(`<meta name="${FINGERPRINT_META}" content="([^"]*)">`))
  return m ? m[1] : null
}

// ── Delta A: the due mark ──────────────────────────────────────────────────

/**
 * The dashboard-state patch for one observation of the open-point set, or null
 * when nothing should be written.
 *
 * Rules, in the order they apply:
 *   - an unchanged set writes nothing (the hook runs on EVERY tool call);
 *   - the FIRST observation records the fingerprint but demands nothing — a
 *     fresh state file must not deny the first call of a fresh session;
 *   - a set the live board ALREADY shows is recorded but not demanded;
 *   - anything else is a real change: `publishDue` is set, persisted, so a
 *     session that dies before publishing hands the mark to its successor.
 */
export function publishDuePatch({ state, fingerprint, at = Date.now() } = {}) {
  if (typeof fingerprint !== 'string' || !fingerprint) return null
  const s = state && typeof state === 'object' ? state : {}
  const seen = typeof s.openFingerprint === 'string' ? s.openFingerprint : null
  const live = typeof s.publishedFingerprint === 'string' ? s.publishedFingerprint : null
  if (seen === fingerprint) {
    // Repair only: a due mark the live board has meanwhile caught up with.
    return s.publishDue && live === fingerprint ? { publishDue: undefined } : null
  }
  const patch = { openFingerprint: fingerprint, openFingerprintAt: at }
  if (seen === null || live === fingerprint) return patch
  return { ...patch, publishDue: { at, fingerprint, previous: seen } }
}

/** Is a publish outstanding? (Reads the persisted mark, tolerating junk.) */
export function isPublishDue(state) {
  const due = state && typeof state === 'object' ? state.publishDue : null
  return !!(due && typeof due === 'object' && !Array.isArray(due))
}

/**
 * What an attestation (`dashboard-guard --synced`) writes about the publish
 * state — the ONLY place the due mark is cleared.
 *
 * A publish counts only when the attested bytes ARE the bytes that went live. A
 * DEFERRED publish leaves the live board behind, so the mark must survive it,
 * and that surviving mark is precisely what the watchdog (delta E) reports. The
 * fingerprint recorded beside it is what the live page is then expected to
 * carry.
 */
export function syncedPublishPatch({ state, fileHash, fingerprint, at = Date.now() } = {}) {
  const s = state && typeof state === 'object' ? state : {}
  if (s.publishDeferred) return {}
  // EITHER record is a publish (delta D, four-eyes finding 1). Reading only the
  // legacy mirror hash here would refuse to attest a board that IS live and
  // steer the session to `--defer` — a false deferral, and one that then makes
  // `isPublished` true for those bytes. That masking record is the dishonesty
  // this whole point replaces; it must not be re-created by the attestation.
  if (!fileHash || (s.publishedHash !== fileHash && s.pagesPublishedHash !== fileHash)) return {}
  const fp = typeof fingerprint === 'string' && fingerprint ? fingerprint : null
  return { publishDue: undefined, ...(fp ? { publishedFingerprint: fp, publishedFingerprintAt: at } : {}) }
}

/**
 * Does the board SHOW every open point? (delta D, four-eyes finding 3.)
 *
 * The fingerprint stamped on a published board is computed from the work order,
 * so it asserts "this board shows these points" — and nothing was checking that
 * it does. A board missing a card would go live stamped current, and both the
 * `--check` and the watchdog would then be green over precisely the
 * missing-card staleness of 28.07.2026. So the publisher asks first.
 *
 * The rule is invariant (4) of the Stop audit, moved EARLIER: a board that could
 * never be attested must not be publishable either. Returns the open points that
 * appear in no section.
 */
export function boardMissingPoints(html, open) {
  const doc = String(html ?? '')
  const seen = new Set([
    ...parseNowCardPoints(doc),
    ...parseQueuePoints(doc),
    ...parseKlaerungPoints(doc),
  ])
  return normaliseOpenSet(open).filter((n) => !seen.has(n))
}

/**
 * What a SUCCESSFUL pages publish (delta D) writes.
 *
 * The transport records its OWN hash rather than overwriting `publishedHash` —
 * the legacy mirror was a different event and attesting one that never happened
 * would be the exact dishonesty delta D was built to end. `publishDeferred` is
 * dropped because there is nothing left to defer, and `publishFailed` because a
 * publish that succeeded supersedes the one that did not.
 *
 * `fingerprint` is what the live page will carry, and it is what the watchdog
 * and `--check` compare the fetched page against.
 */
export function pagesPublishPatch({ fileHash, fingerprint, at = Date.now() } = {}) {
  const fp = typeof fingerprint === 'string' && fingerprint ? fingerprint : null
  return {
    pagesPublishedHash: typeof fileHash === 'string' && fileHash ? fileHash : undefined,
    pagesPublishedAt: at,
    publishDue: undefined,
    publishDeferred: undefined,
    publishFailed: undefined,
    ...(fp ? { publishedFingerprint: fp, publishedFingerprintAt: at } : {}),
  }
}

/**
 * What a FAILED pages publish writes. The failure is persisted rather than
 * merely printed: the watchdog (delta E) reports a `publishFailed` that survived
 * a tick, and that is the layer that still speaks when the session is wedged.
 * The due mark is deliberately left standing — nothing went live.
 */
export function pagesFailurePatch({ reason, at = Date.now() } = {}) {
  return { publishFailed: { at, reason: String(reason ?? 'unknown') } }
}

/**
 * The URL the checker fetches: the content URL with a cache-buster.
 *
 * raw.githubusercontent answers with `cache-control: max-age=300`, so a plain
 * re-fetch can be served a five-minute-old body from the CDN. A unique query
 * usually misses that cache and gets the fresh object; where it does not,
 * `LIVE_GRACE_MS` is the floor that keeps the check from flapping. Both, not
 * either — the query is the fast path, the grace is the guarantee.
 */
export function liveCheckUrl(url = BOARD_CONTENT_URL, now = Date.now()) {
  const base = String(url ?? '')
  return `${base}${base.includes('?') ? '&' : '?'}t=${Math.floor(Number(now) || 0)}`
}

/**
 * CAN this session publish at all? The deny of delta B may only escalate where
 * the answer is yes — a session that cannot publish would spin against a gate it
 * has no way to satisfy, and a blocked turn produces nothing (CLAUDE.md §7.2).
 *
 * `transport: 'pages'` is the delta-D answer and is available to EVERY session,
 * headless included: it is a script, not a tool binding — so in practice every
 * caller passes it and the branch below never decides anything. The branch is
 * the legacy mirror's, kept only so an old record cannot turn into a false "you
 * cannot publish"; it counts only when THIS session has actually used the tool.
 */
export function publishCapability({ state, sessionId = '', transport = null } = {}) {
  if (transport === 'pages') return { canPublish: true, how: 'pages' }
  const seen = state && typeof state === 'object' ? state.artifactToolSeen : null
  if (seen && typeof seen === 'object') {
    const owner = typeof seen.sessionId === 'string' ? seen.sessionId : ''
    if (!owner || !sessionId || owner === sessionId) return { canPublish: true, how: 'artifact' }
  }
  return { canPublish: false, how: null }
}

// ── Delta D/E: is the LIVE page current? ───────────────────────────────────

/**
 * Compare the fetched board against the work order.
 *
 * `verdict` is one of:
 *   'current'     — the live page carries the expected fingerprint;
 *   'behind'      — it carries a different one, for longer than the grace;
 *   'settling'    — it differs, but within the deploy/CDN grace: not an alarm;
 *   'unreachable' — the fetch failed, or the page carries no fingerprint at all.
 *
 * UNREACHABLE IS NEVER 'current'. A page that cannot be read says nothing about
 * the board, and the one thing this whole point exists to prevent is a green
 * check over an unread board.
 */
export function liveBoardVerdict({
  liveHtml = null,
  fetchError = null,
  expected = null,
  publishedAt = 0,
  now = Date.now(),
  graceMs = LIVE_GRACE_MS,
} = {}) {
  if (fetchError || typeof liveHtml !== 'string' || !liveHtml.trim()) {
    return { verdict: 'unreachable', live: null, expected, reason: String(fetchError ?? 'the live board could not be fetched') }
  }
  const live = readFingerprint(liveHtml)
  if (!live) {
    return { verdict: 'unreachable', live: null, expected, reason: 'the live board carries no open-point fingerprint' }
  }
  if (!expected) return { verdict: 'unknown', live, expected, reason: 'no expected fingerprint was computed' }
  if (live === expected) return { verdict: 'current', live, expected, reason: '' }
  const age = Number.isFinite(publishedAt) && publishedAt > 0 ? now - publishedAt : Infinity
  if (age <= graceMs) {
    return { verdict: 'settling', live, expected, reason: `published ${Math.round(age / 1000)} s ago — inside the deploy/CDN grace` }
  }
  return { verdict: 'behind', live, expected, reason: `the live board shows ${live}, the work order ${expected}` }
}

/**
 * The launcher's alert decision (delta E), with an injected clock so it is pure.
 *
 * It alerts on a board that is BEHIND or UNREACHABLE, and on a `publishDue` /
 * `publishFailed` that has survived a whole tick — the case where the session is
 * wedged and no Stop hook will ever run again. Each alert is keyed, so one
 * standing fault is reported ONCE rather than every fifteen minutes; a recovered
 * board clears the key so the NEXT fault is reported again.
 */
export function watchdogDecision({
  verdict = 'unknown',
  live = null,
  expected = null,
  reason = '',
  state = null,
  now = Date.now(),
  lastKey = null,
  tickMs = WATCHDOG_TICK_MS,
} = {}) {
  const s = state && typeof state === 'object' ? state : {}
  const parts = []
  let priority = 'default'

  if (verdict === 'behind') {
    parts.push(`The live board is BEHIND the work order (page ${live ?? '?'} vs ${expected ?? '?'}).`)
    priority = 'high'
  } else if (verdict === 'unreachable') {
    parts.push(`The live board could not be read: ${reason || 'unknown reason'}.`)
    priority = 'high'
  }

  const dueAt = Number(s.publishDue && s.publishDue.at)
  if (Number.isFinite(dueAt) && dueAt > 0 && now - dueAt > tickMs) {
    parts.push(`A board publish has been due for ${Math.round((now - dueAt) / 60000)} min and no session has run it.`)
    priority = 'high'
  }
  const failedAt = Number(s.publishFailed && s.publishFailed.at)
  if (Number.isFinite(failedAt) && failedAt > 0 && now - failedAt > tickMs) {
    parts.push(`The last publish FAILED ${Math.round((now - failedAt) / 60000)} min ago and was never retried.`)
    priority = 'urgent'
  }

  if (parts.length === 0) return { notify: false, key: null, title: '', message: '', priority: 'default' }
  const key = `${verdict}:${live ?? '-'}:${expected ?? '-'}:${Math.round((dueAt || 0) / 60000)}:${Math.round((failedAt || 0) / 60000)}`
  if (lastKey && lastKey === key) return { notify: false, key, title: '', message: '', priority }
  // The title names what was actually found. A due-or-failed publish reported
  // over a page that IS current is not "out of date" — mislabelling it teaches
  // the reader to distrust the one channel that speaks when a session is wedged.
  const title =
    verdict === 'unreachable' ? 'Board unreachable' : verdict === 'behind' ? 'Board out of date' : 'Board publish outstanding'
  return { notify: true, key, title, message: `${parts.join(' ')} ${BOARD_PAGE_URL}`, priority }
}
