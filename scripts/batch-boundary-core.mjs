// Pure core of the AUTONOMOUS SESSION BOUNDARY (user 27.07.2026).
//
// WHY: 80 % of the token spend sits above 150k context, because one batch
// session carries point after point. Run 24/7 that is the dominant cost
// (1.25 %/h of the weekly quota against the ~0.6 %/h that fits). The cure is the
// mechanism that already exists: the session ENDS at a point boundary and the OS
// LAUNCHER brings up a fresh one, which `batch-resume-hook`
// re-orients. Nothing new drives the batch — what changes is that ending is now
// a LEGAL way to finish a turn.
//
// The danger this core exists to remove is the obvious one: `batch-progress-guard`
// hard-blocks every turn end while open points remain, so without it the guard
// would block exactly the behaviour the change wants; and if the guard simply
// stopped blocking, a disabled launcher would strand the batch forever. So a
// boundary stop is legal only when BOTH hold:
//
//   1. The point the session claims to have closed is VERIFIABLY closed — gone
//      from TASKS.md's open list AND ticked in docs/tasks-archive.md. The claim
//      alone proves nothing; the work order is the authority.
//   2. The launcher is ARMED (the scheduled task's real state, probed, not
//      assumed). Unknown counts as NOT armed: erring toward "keep working" can
//      cost context, erring toward "stop" can cost the whole batch.
//
// POINT 388 (28.07.2026) corrects one assumption of the paragraph this replaces.
// The boundary used to end at "the stop is permitted": the lock was left to
// expire the honest way, on the reasoning that the old process dies within
// minutes. It does not. On the first live night a session ended its TURN and kept
// its PROCESS — an interactive window fires no SessionEnd, so nothing released
// the lock — and the launcher correctly refused to spawn a successor beside a
// live owner, 21 ticks in a row, for five and a half hours.
//
// So the boundary is now TAKEN rather than offered, in three parts:
//   - `boundaryDueFrom` below: a point closed IN THIS SESSION with no marker
//     recorded makes the guard BLOCK and name the command, instead of falling
//     through to a message where the boundary is one option among many.
//   - the Stop hook marks the lock HANDED OVER (scripts/batch-singleton.mjs
//     `markHandover`) at the moment it allows the stop, and only there. The
//     singleton stays intact: the handover is not an age heuristic but the
//     owner's own statement, it survives only while no further tool call bumps
//     the heartbeat past it, and a live pid still gets a grace window.
//   - the launcher REPORTS a silent owner instead of only logging it.
//
// The imports are NAMES, from two constants modules that import nothing: the
// board's commands (board-remedy) and the launcher's identity
// (batch-launcher-core). This core prints the instruction a session follows
// literally at a boundary, and a second spelling of those names here is how the
// printed path and the working path came apart in the first place.
import { EDIT_CMD, NONE_CARD_CMD } from './board-remedy.mjs'
import { LAUNCHER_TASK_NAME } from './batch-launcher-core.mjs'

/** How long a recorded boundary marker stays usable. Long enough for the merge,
 *  the tick, the push and the closing report of a point; short enough that a
 *  marker from an abandoned attempt cannot authorise a stop an hour later. */
export const BOUNDARY_FRESH_MS = 60 * 60 * 1000

/** The Windows launcher's name, re-exported so the old import path keeps working.
 *  One spelling, in batch-launcher-core, which also knows the Linux daemon's. */
export { LAUNCHER_TASK_NAME }

/**
 * Map a raw launcher state to armed / disabled / unknown. Its vocabulary is the
 * Windows one — `Get-ScheduledTask ... .State`, as strings or as the numeric
 * ScheduledTask states (0 Unknown, 1 Disabled, 2 Queued, 3 Ready, 4 Running),
 * because PowerShell hands back either depending on how the value is formatted —
 * and the Linux daemon publishes its own state in the SAME words (point 474), so
 * both hosts are judged here and nowhere else.
 *
 * ARMED means "this task will fire again on its own": Ready, Queued and Running
 * all do. Disabled does not, and Unknown is not evidence that it will.
 */
export function classifyLauncherState(raw) {
  if (raw === null || raw === undefined) return 'unknown'
  const s = String(raw).trim().toLowerCase()
  if (s === '') return 'unknown'
  if (s === 'ready' || s === 'queued' || s === 'running' || s === '2' || s === '3' || s === '4') {
    return 'armed'
  }
  if (s === 'disabled' || s === '1') return 'disabled'
  return 'unknown'
}

/**
 * Is point `n` closed, judged by the split work order (point 365 / the 26.07.2026
 * split)? `tasksOpenText` is TASKS.md, `archiveText` is docs/tasks-archive.md.
 * Returns 'open' | 'closed' | 'unknown'.
 *
 * "Closed" needs BOTH halves: absent from the open list and present, ticked, in
 * the archive. Absence alone would read a point that was never written — or one
 * lost to a bad edit — as finished.
 */
export function pointClosure(n, tasksOpenText, archiveText) {
  const num = Number(n)
  if (!Number.isInteger(num) || num <= 0) return 'unknown'
  const open = new RegExp(`^- \\[ \\] ${num}\\.`, 'm')
  const ticked = new RegExp(`^- \\[x\\] ${num}\\.`, 'm')
  if (open.test(String(tasksOpenText ?? ''))) return 'open'
  if (ticked.test(String(archiveText ?? ''))) return 'closed'
  // A tick that has not been archived yet still counts as closed — the archive
  // move follows the tick, and the two are not always one commit apart.
  if (ticked.test(String(tasksOpenText ?? ''))) return 'closed'
  return 'unknown'
}

/**
 * Judge a recorded boundary marker. Inputs are plain data:
 *   marker    — { sessionId, point, at } or null
 *   sid       — the session asking (the Stop hook's own session id)
 *   now       — epoch ms
 *   closure   — 'open' | 'closed' | 'unknown' from pointClosure()
 *   freshMs   — override for tests
 * Returns { valid, point, reason }.
 */
/**
 * IS THIS MARKER FRESH? PURE, and the one place that decides it (Sol's review of
 * ffa0a78). A FUTURE stamp is not fresh: `now - at < freshMs` alone accepted a
 * marker dated forward, which would authorise a stop and hold the seal far
 * beyond the window — a clock that jumped, or a hand-written marker. An age
 * below zero is therefore treated exactly like an expired one: the boundary is
 * re-taken, which costs one command.
 */
export function markerFresh(marker, now, freshMs = BOUNDARY_FRESH_MS) {
  const at = marker?.at
  if (typeof at !== 'number' || !Number.isFinite(at)) return false
  const age = now - at
  return age >= 0 && age < freshMs
}

export function assessBoundary({ marker, sid, now, closure, freshMs = BOUNDARY_FRESH_MS, watermarkNow = null }) {
  if (!marker || typeof marker !== 'object') {
    return { valid: false, point: null, reason: 'no-marker' }
  }
  // A CONTEXT boundary (point 675, defeat 3) records no point and needs no
  // closure: its licence is the recorded watermark reading, taken at commit time
  // from a real measurement — and the marker is a CLAIM, re-judged here (Sol
  // review of 807c2bf, finding 5): the reading must actually clear the recorded
  // mark, or a marker carrying one token would authorise a stop. Freshness and
  // session binding hold exactly as for a point boundary.
  if (marker.cause === BOUNDARY_CAUSES.CONTEXT) {
    // Only `--commit --context` writes a context marker, and it always seals it
    // — there is no legacy context format, so an unphased context claim is a
    // hand-written one and authorises nothing (Sol re-review of cd6faaa,
    // finding 3).
    if (marker.phase !== BOUNDARY_PHASES.COMMITTED) {
      return { valid: false, point: null, reason: 'context-marker-uncommitted' }
    }
    if (
      typeof marker.tokens !== 'number' ||
      !(marker.tokens > 0) ||
      typeof marker.watermark !== 'number' ||
      !(marker.watermark > 0)
    ) {
      return { valid: false, point: null, reason: 'context-marker-unmeasured' }
    }
    // The claim may not bring its own yardstick (Sol final round, finding 1):
    // `{tokens: 1, watermark: 1}` would pass a check that trusts the recorded
    // mark alone. Where the caller supplies the CURRENTLY configured mark, the
    // reading must clear the HIGHER of the two.
    const mark = Math.max(
      marker.watermark,
      typeof watermarkNow === 'number' && watermarkNow > 0 ? watermarkNow : 0,
    )
    if (marker.tokens < mark) {
      return { valid: false, point: null, reason: 'context-below-watermark' }
    }
    if (!markerFresh(marker, now, freshMs)) {
      return { valid: false, point: null, reason: 'marker-stale' }
    }
    if (!sid || marker.sessionId !== sid) {
      return { valid: false, point: null, reason: 'marker-foreign-session' }
    }
    return { valid: true, point: null, reason: 'context-boundary' }
  }
  const point = Number(marker.point)
  if (!Number.isInteger(point) || point <= 0) {
    return { valid: false, point: null, reason: 'marker-malformed' }
  }
  if (!markerFresh(marker, now, freshMs)) {
    return { valid: false, point, reason: 'marker-stale' }
  }
  // A POINT MARKER MUST BE COMMITTED TOO (Sol's review of abdde93). The legacy
  // shape was tolerated while the one-shot form still wrote it; that form is
  // retired, so an unphased marker is now either a leftover of the old code or a
  // hand-written claim — and either way it would authorise a stop that skipped
  // `--prepare`, its receipt, the card proof, the transfer and the seal. It is
  // refused like an old receipt: the boundary is re-taken, which costs the two
  // commands it should have been taken with.
  if (markerPhase(marker) !== 'committed') {
    return { valid: false, point, reason: 'marker-uncommitted' }
  }
  // Bound to the session that recorded it: a marker left by a previous session
  // must never authorise this one's stop.
  if (!sid || marker.sessionId !== sid) {
    return { valid: false, point, reason: 'marker-foreign-session' }
  }
  if (closure === 'open') return { valid: false, point, reason: 'point-still-open' }
  if (closure !== 'closed') return { valid: false, point, reason: 'point-not-verifiable' }
  return { valid: true, point, reason: 'boundary' }
}

/** How long after a tick the boundary counts as DUE. Wide enough to cover a
 *  merge, a push and a closing report; a session still working an hour and a
 *  half later has plainly moved on and gets the ordinary message again. */
export const BOUNDARY_DUE_MS = 90 * 60 * 1000

/**
 * Point numbers a diff actually CLOSED — added `- [x] N.` lines, minus the ones
 * the same diff also removed. The subtraction is what tells a tick from
 * housekeeping: moving an already-ticked point from TASKS.md into the archive
 * adds the line in one file and removes it from the other, and would otherwise
 * read as a point just closed (four-eyes review, finding 7).
 */
export function tickedPointsInDiff(diffText) {
  const added = []
  const removed = new Set()
  for (const line of String(diffText ?? '').split('\n')) {
    const a = line.match(/^\+- \[x\] (\d+)\./)
    if (a) added.push(Number(a[1]))
    const r = line.match(/^-- \[x\] (\d+)\./)
    if (r) removed.add(Number(r[1]))
  }
  return added.filter((n) => !removed.has(n))
}

/**
 * Is a boundary DUE — a point closed with no marker recorded? Inputs are plain
 * data:
 *   tick       — { point, at } from the newest work-order commit, or null
 *   ownerSince — when THIS session acquired the batch lock (acquiredAt)
 *   now, dueMs
 * Returns the point number, or null.
 *
 * `tick.at >= ownerSince` is the load-bearing condition. Without it a freshly
 * spawned successor would read its PREDECESSOR's tick, take a boundary for a
 * point it never closed and end after doing nothing — session ping-pong instead
 * of work. A session can only be sent home for a point it closed itself.
 */
export function boundaryDueFrom({ tick, ownerSince, now, dueMs = BOUNDARY_DUE_MS }) {
  if (!tick || !Number.isInteger(tick.point) || tick.point <= 0) return null
  if (typeof tick.at !== 'number') return null
  if (!(now - tick.at < dueMs)) return null
  if (typeof ownerSince !== 'number') return null // unknown ownership start → never nag
  if (tick.at < ownerSince) return null
  return tick.point
}

// --- What ends a boundary, and what does not (live finding 2, 28.07.2026) -----
//
// Taking the boundary writes a marker and marks the lock handed over; any
// further work withdraws it again, which is right in itself. But the Stop chain
// ROUTINELY sends a session back to work AFTER the boundary is taken — a missing
// timestamp, an unreviewed mechanism commit, a dashboard whose HEAD moved — and
// each of those rounds silently un-took the handover. The log shows it to the
// second: `HANDOVER point 378` at 08:56:12, `WITHDRAWN point 378` at 08:56:16.
// A boundary that only survives a turn with nothing left to do is not a
// mechanism, because finding something left to do is the Stop chain's purpose.
//
// So the withdrawal distinguishes work that CONTINUES the batch from work a Stop
// guard DEMANDED: the marker survives edits confined to the CLOSING SET — the
// board, the review ledger, the work order's own entry and the boundary's own
// bookkeeping — and anything else withdraws it. Deliberately conservative: an
// unrecognised tool, an unparseable command and a call with no target all
// withdraw. A wrongly withdrawn boundary costs one command to re-take; a wrongly
// KEPT one lets a successor spawn beside a working session, which is the
// incident class this whole apparatus exists to prevent.

// --- The TWO-PHASE boundary (point 675, defeat 1) ------------------------------
//
// The marker used to be written FIRST and the bookkeeping done after — and the
// bookkeeping (the card publish, every guard remedy a blocked turn forces)
// counted as work and cleared the marker. Measured twice on 13.08.2026; once it
// left the batch idle for forty minutes. The boundary is now two-phase:
//   --prepare  does/validates ALL bookkeeping and writes NO marker — there is
//              nothing to delete while the session finishes ending;
//   --commit   is the session's LAST repository action: it seals the marker
//              (phase 'committed'), and any mutation attempted afterwards is an
//              EXPLICIT, LOUD error (a PreToolUse deny naming `--clear` as the
//              way back) rather than a silent marker deletion.

/** Marker phases. A legacy marker (no phase field) keeps the old withdrawal
 *  semantics; only a COMMITTED marker is sealed. */
export const BOUNDARY_PHASES = Object.freeze({ COMMITTED: 'committed' })

/** What kind of boundary the marker records: a closed point, or the context
 *  watermark (point 675, defeat 3 — a session can outgrow its context without
 *  ever closing a point). */
export const BOUNDARY_CAUSES = Object.freeze({ POINT: 'point', CONTEXT: 'context' })

export function markerPhase(marker) {
  if (!marker || typeof marker !== 'object') return 'none'
  return marker.phase === BOUNDARY_PHASES.COMMITTED ? 'committed' : 'legacy'
}

/**
 * THE PREPARE RECEIPT (Sol's review of 4e93933): two phases are only two phases
 * if the first one is REQUIRED. `--commit --context` could be called with no
 * `--prepare` at all, so the board card that says WHY the batch handed over —
 * the part of defeat 3 the reader actually sees — could be skipped silently; the
 * point commit checked only that the OLD current-work card was gone.
 *
 * `--prepare` therefore leaves a receipt, and `--commit` refuses without a fresh
 * one of its own session, cause and point. The receipt is NOT a marker: nothing
 * withdraws it and no guard reads it, so it cannot revive defeat 1 (work
 * deleting what the boundary needs), and its refusal names a ONE-COMMAND way
 * back — `--prepare` is runnable whenever `--commit` would be, so this can
 * refuse a session but never trap one.
 *
 * RESIDUAL, deliberately: a session that prepares, then works for a while, then
 * commits within the freshness window still passes. The receipt proves the
 * bookkeeping phase RAN, not that nothing followed it; what follows the commit
 * is the sealed marker's business.
 */
/** RAISED with every change to what `cardsBefore` HOLDS (Sol's review of
 *  ebf7d00): v2 stored regions cut only at the card ends, so an old receipt's
 *  prefixed string would no longer equal the region this code now cuts, and the
 *  unchanged card would read as fresh. A receipt of an older version is refused
 *  and re-taken rather than compared across representations. */
export const PREPARED_RECEIPT_V = 4

export function preparedReceipt({
  sid,
  cause = BOUNDARY_CAUSES.POINT,
  point = null,
  now,
  destination = null,
  board = { readable: false, cards: [] },
}) {
  const { readable = false, cards = [] } = board ?? {}
  return {
    v: PREPARED_RECEIPT_V,
    sessionId: String(sid ?? ''),
    cause,
    point: point ?? null,
    at: Number(now),
    // WHERE the batch was going when the card was written (Sol's review of
    // 7ecebed): a claim appearing or expiring between the phases changes the
    // card's text, so the commit must re-prepare rather than judge the new
    // destination against the old board reading.
    destination,
    // The handover cards ALREADY on the board when the preparation looked — the
    // leftovers of earlier handovers. `--commit` demands a card that is not one
    // of them, which is the only thing that tells this handover's card from a
    // predecessor's (Sol's review of bcf820c).
    cardsBefore: Array.isArray(cards) ? cards : [],
    // …and WHETHER that reading happened at all: an unreadable board is not an
    // empty one (Sol's review of 456be8f). Collapsed into an empty list, a
    // failed reading would make every standing card look newly added once the
    // board came back, and a leftover card would prove the handover.
    boardRead: readable === true,
  }
}

/** May `--commit` run at all? PURE. Null = prepared; otherwise the refusal. */
export function unpreparedRefusal({
  receipt,
  sid,
  cause = BOUNDARY_CAUSES.POINT,
  point = null,
  destination = null,
  now,
  freshMs = BOUNDARY_FRESH_MS,
} = {}) {
  const how =
    cause === BOUNDARY_CAUSES.CONTEXT
      ? 'node scripts/batch-boundary.mjs --prepare --context --transcript <path>'
      : `node scripts/batch-boundary.mjs --prepare ${point ?? '<point>'}`
  const refuse = (why) =>
    `THE COMMIT IS NOT PREPARED (${why}) — the boundary is TWO-PHASE, and the first phase is where the board ` +
    `card, the publish and the checks happen. Run \`${how}\`, do the bookkeeping it names, then commit. ` +
    'Nothing recorded.'
  if (!receipt || typeof receipt !== 'object') return refuse('no --prepare receipt exists')
  // A receipt of an OLDER SHAPE proves less than the commit now asks — without
  // its board reading the stale-card check has nothing to compare against, so it
  // is refused rather than silently downgraded (Sol's review of 7ecebed).
  if (
    receipt.v !== PREPARED_RECEIPT_V ||
    !Array.isArray(receipt.cardsBefore) ||
    !receipt.cardsBefore.every((r) => typeof r === 'string')
  ) {
    return refuse('the receipt is of an older shape and carries no usable board reading')
  }
  if (!sid || receipt.sessionId !== sid) return refuse(`the receipt belongs to session ${receipt.sessionId || '?'}`)
  if (destination !== null && receipt.destination !== destination) {
    return refuse(`the batch now goes elsewhere than at the preparation (${receipt.destination ?? '?'} → ${destination})`)
  }
  if (receipt.cause !== cause) {
    return refuse(
      `the receipt prepared ${receipt.cause === BOUNDARY_CAUSES.CONTEXT ? 'a CONTEXT boundary' : 'a POINT boundary'}`,
    )
  }
  if (cause === BOUNDARY_CAUSES.POINT && Number(receipt.point) !== Number(point)) {
    return refuse(`the receipt prepared point ${receipt.point ?? '?'}, not point ${point ?? '?'}`)
  }
  // A FUTURE age is not freshness (Sol's review of ffa0a78): `now - at < freshMs`
  // alone accepts a hand-written receipt dated forward, which would stay valid
  // until that date plus the window. An age below zero is a broken or forged
  // stamp, and both are refused the same way.
  const age = typeof receipt.at === 'number' && Number.isFinite(receipt.at) ? now - receipt.at : NaN
  if (!(age >= 0 && age < freshMs)) {
    return refuse('the receipt is stale — the bookkeeping it named is no longer this turn\'s')
  }
  return null
}

/** The card sentence each boundary cause opens with — the reader's proof that
 *  the handover was announced, and what `boardCarriesCard` looks for. */
export const BOUNDARY_CARD_HEADS = Object.freeze({
  [BOUNDARY_CAUSES.CONTEXT]:
    'Der Kontext dieser Sitzung hat die Wasserstandsmarke erreicht; ich übergebe deshalb jetzt, statt weiter in diesem teuren Kontext zu arbeiten.',
  [BOUNDARY_CAUSES.POINT]: 'Der Punkt ist abgeschlossen.',
})

/**
 * WHAT PROVES THIS CARD IS ON THE BOARD? PURE — the fragments that identify a
 * card of exactly this cause AND destination (Sol's reviews of ffa0a78/389bbc7:
 * the receipt proves `--prepare` ran, not that the bookkeeping it printed was
 * done, and the absence of the OLD card is no evidence for the new one).
 *
 * The fragments are deliberately ASCII: the card goes through the board's HTML,
 * and a check that hangs on an umlaut would block a correct boundary the day
 * that pipeline starts escaping one. They are pinned against the real card text
 * by a test, so a reworded card breaks the test rather than the mechanism.
 */
/** Where one board card ENDS: every card is a `<details>` block, so this is the
 *  real boundary the proof is cut at, not a guessed distance. */
export const CARD_END = '</details>'

/** …and where one begins, so a region is cut back to the card itself rather than
 *  to whatever stood between it and the card before it. */
export const CARD_START = '<details'

/** The fallback for a board carrying no card markup at all — one card's length
 *  (the longest card is ~900 characters, the slack covers its surroundings).
 *  A distance can only ever be a fallback: adjacent cards are as close as their
 *  markup puts them (Sol's review of 1589da5). */
export const CARD_PROOF_WINDOW = 2000

export function cardProofFragments({ cause = BOUNDARY_CAUSES.POINT, destination } = {}) {
  const head =
    cause === BOUNDARY_CAUSES.CONTEXT
      ? 'Der Kontext dieser Sitzung hat die Wasserstandsmarke erreicht'
      : 'Der Punkt ist abgeschlossen.'
  // The head alone identifies a WATERMARK card; a point head is one short
  // sentence, so the destination sentence carries the identification there.
  const where =
    destination === BOUNDARY_DESTINATIONS.CLAIMING_WINDOW
      ? 'Der Stapel geht NICHT an eine frische Sitzung'
      : 'Der Launcher startet sie innerhalb seines Intervalls'
  return [head, where]
}

/**
 * DOES THE BOARD CARRY THAT CARD? PURE. Returns
 * { carries, verifiable, missing } — `verifiable` false for a board that could
 * not be read at all.
 *
 * An unreadable board does NOT refuse: a session that cannot reach its board
 * must still be able to hand over, or a missing file ends the batch instead of
 * a session. The caller SAYS SO rather than passing in silence — the one
 * outcome this whole point forbids.
 *
 * RESIDUAL, named because no check here can close it: a card left standing from
 * a PREVIOUS handover satisfies these fragments. Telling this handover's card
 * from the last one needs an identity on the card itself, which is the board's
 * user-owned structure, not this mechanism's to change.
 */
/** The rounding slack on a `HH:MM` stamp compared with a millisecond clock: one
 *  minute at each end, and nothing more. The acceptable arc is otherwise the
 *  REAL interval between the preparation and now — bounded by the receipt's own
 *  freshness rather than by an invented window (Sol's review of 46c994e). */
export const CARD_STAMP_SLACK_MIN = 1

/** Berlin wall-clock minute of the day — the board stamps `Stand HH:MM` in that
 *  zone, so a comparison must be made in it. PURE for a given instant. */
export function berlinMinuteOfDay(ms) {
  const [h, m] = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(ms))
    .split(':')
    .map(Number)
  return (Number(h) % 24) * 60 + Number(m)
}

/**
 * IS THIS CARD THIS HANDOVER'S, or the last one's (Sol's reviews of
 * 9096fb7/46c994e)? PURE. The fragments identify a card of the right cause and
 * destination — and the card the PREVIOUS handover left standing has both. What
 * tells them apart is the board's own `Stand HH:MM`, which must fall inside the
 * REAL interval between the preparation and now, plus a minute of rounding at
 * each end. That interval is bounded by the receipt's freshness, so the arc a
 * stale card could land in is the elapsed hour at most — not a window this
 * function invents.
 *
 * An UNSTAMPED region does not prove currency where the board stamps at all: it
 * is refused, exactly because every generated state card carries a stamp. On a
 * board that stamps nothing it passes, so a card format without stamps cannot
 * trap a session at its boundary.
 *
 * RESIDUAL, named: the stamp carries no DATE, so a card from an earlier day
 * whose wall clock falls in that same elapsed arc passes. Dating the stamp is
 * the board's user-owned structure, not this mechanism's to change.
 */
export function cardStampIsCurrent(
  region,
  { sinceMs = null, nowMs = null, boardStamps = true, slackMin = CARD_STAMP_SLACK_MIN } = {},
) {
  if (typeof sinceMs !== 'number' || !Number.isFinite(sinceMs)) return true
  const m = String(region ?? '').match(/Stand\s+(\d{1,2}):(\d{2})/)
  if (!m) return boardStamps !== true
  const stamp = (Number(m[1]) % 24) * 60 + Number(m[2])
  const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : sinceMs
  const slack = slackMin * 60_000
  // THE STAMP IS RESOLVED TO A REAL INSTANT, not to an arc on a clock face
  // (Sol's review of 9dcc783). Modular minute arithmetic reads Berlin's DST
  // rollback — where 02:00–03:00 happens twice — as a nearly full day, and a
  // stale card of that night walks through. So the LATEST instant not after the
  // commit whose Berlin wall clock shows this stamp is found, and that instant
  // is compared with the preparation. The doubled hour resolves to its second
  // occurrence, which is the correct one, and the search costs at most a day of
  // minutes on one command.
  for (let back = 0; back <= 1500; back += 1) {
    const t = now + slack - back * 60_000
    if (berlinMinuteOfDay(t) !== stamp) continue
    return t >= sinceMs - slack
  }
  return false
}

/**
 * THE CARD REGIONS OF THE BOARD that carry ALL these fragments. PURE.
 *
 * The board is cut at its real card boundaries — every card is a `<details>`
 * block, so each `</details>` ends one (Sol's reviews of 9f93aeb/1589da5:
 * searched independently, a context/fresh-session card BESIDE a
 * point/claiming-window card satisfied a proof no card on that board ever made,
 * and a DISTANCE cannot tell adjacent cards apart). A board without that markup
 * falls back to one card's length, which is still better than the whole file.
 */
export function cardRegions(boardText, fragments = [], { windowChars = CARD_PROOF_WINDOW } = {}) {
  const text = typeof boardText === 'string' ? boardText : ''
  const list = (Array.isArray(fragments) ? fragments : []).filter(Boolean)
  if (list.length === 0) return []
  const [head, ...rest] = list
  let regions
  if (text.includes(CARD_END)) {
    regions = text.split(CARD_END)
  } else {
    regions = []
    for (let at = text.indexOf(head); at >= 0; at = text.indexOf(head, at + 1)) {
      regions.push(text.slice(at, at + windowChars))
    }
  }
  return regions
    .filter((r) => r.includes(head) && rest.every((f) => r.includes(f)))
    // THE REGION IS THE CARD, not what precedes it (Sol's review of 04cea00):
    // split at the card ends, a region also carries whatever stood between the
    // previous card and this one — a section header, another card's tail — so an
    // unrelated edit there would make an UNCHANGED stale card look new. Each
    // region is therefore cut back to its own opening tag.
    .map((r) => {
      const start = r.lastIndexOf(CARD_START, r.indexOf(head))
      return start >= 0 ? r.slice(start) : r
    })
}

export function boardCarriesCard(
  boardText,
  fragments = [],
  { windowChars = CARD_PROOF_WINDOW, sinceMs = null, nowMs = null, knownRegions = null } = {},
) {
  if (typeof boardText !== 'string' || !boardText.trim()) return { carries: true, verifiable: false, missing: [] }
  const list = (Array.isArray(fragments) ? fragments : []).filter(Boolean)
  const missing = list.filter((f) => !boardText.includes(f))
  if (missing.length > 0) return { carries: false, verifiable: true, missing }
  if (list.length < 2) return { carries: true, verifiable: true, missing: [] }
  const rest = list.slice(1)
  const whole = cardRegions(boardText, list, { windowChars })
  if (whole.length === 0) return { carries: false, verifiable: true, missing: rest, split: true }
  // …AND IT MUST BE THIS HANDOVER'S CARD, not the one the last handover left
  // standing (Sol's reviews of 9096fb7/bcf820c). Two things are asked, and the
  // FIRST is the one that decides, because no reading of an undated `HH:MM` ever
  // can: the card must not be BYTE-IDENTICAL to a card that was already on the
  // board when `--prepare` looked. A leftover card is exactly that; a card put
  // up after the preparation is not. The stamp is asked afterwards, as the
  // cheaper second signal, and only where the board stamps at all.
  // A RECORDED REGION THAT IS NOT A CARD is a broken reading, not an empty one
  // (Sol's review of 9ff9311): `['not a card']` would match nothing, and every
  // leftover card would count as new. Every entry `--prepare` writes carries the
  // head fragment by construction, so one that does not means the receipt cannot
  // be judged against — say so instead of passing.
  if (
    Array.isArray(knownRegions) &&
    knownRegions.some((r) => typeof r !== 'string' || !list.every((f) => r.includes(f)))
  ) {
    return { carries: false, verifiable: true, missing: [], malformedKnown: true }
  }
  const known = Array.isArray(knownRegions) ? new Set(knownRegions) : null
  const fresh = known ? whole.filter((r) => !known.has(r)) : whole
  if (fresh.length === 0) return { carries: false, verifiable: true, missing: [], stale: true }
  const boardStamps = /Stand\s+\d{1,2}:\d{2}/.test(boardText)
  if (!fresh.some((r) => cardStampIsCurrent(r, { sinceMs, nowMs, boardStamps }))) {
    return { carries: false, verifiable: true, missing: [], stale: true }
  }
  return { carries: true, verifiable: true, missing: [] }
}

/**
 * MUST THIS CALL BE DENIED BECAUSE THE BOUNDARY IS COMMITTED? PURE.
 *
 * Only a fresh, committed marker belonging to the asking session denies, and only
 * a call that is NOT part of ending (the closing set stays open, so the card
 * publish and `--clear` itself are never blocked). Everything else — a stale
 * marker, a foreign one, a legacy one — denies nothing: the deny is a seal on a
 * deliberate `--commit`, never a trap, and its reason names the one-command way
 * back. Returns { deny, reason }.
 *
 * THE SEAL EXPIRES WITH THE MARKER, deliberately (Sol's review of 4e93933 called
 * this a fail-open route; it is the fail-open RULE). A marker past `freshMs` no
 * longer authorises a stop either — `assessBoundary` calls it `marker-stale` —
 * so a session that outsits its own seal has not handed over and kept working:
 * its handover lapsed and must be re-taken from `--prepare`. The alternative, a
 * seal without end, is the one thing a guard here may never be: a session
 * trapped by a marker nothing can time out.
 */
export function sealedBoundaryDeny({
  marker,
  sid,
  now,
  toolName,
  command,
  filePath,
  freshMs = BOUNDARY_FRESH_MS,
} = {}) {
  if (markerPhase(marker) !== 'committed') return { deny: false, reason: null }
  if (!sid || marker.sessionId !== sid) return { deny: false, reason: null }
  if (!markerFresh(marker, now, freshMs)) return { deny: false, reason: null }
  if (handoverSurvivesCall({ toolName, command, filePath }).survives) return { deny: false, reason: null }
  const what = marker.cause === BOUNDARY_CAUSES.CONTEXT ? 'the context watermark' : `point ${marker.point ?? '?'}`
  return {
    deny: true,
    reason:
      `THE BOUNDARY IS COMMITTED (${what}) — \`batch-boundary.mjs --commit\` was this session's last ` +
      `repository action, so this call is refused instead of silently deleting the marker (that silent ` +
      `deletion defeated every handover on 13.08.2026). END THE SESSION NOW. If you genuinely must work ` +
      `again, withdraw the boundary FIRST: \`node scripts/batch-boundary.mjs --clear\` — then this call is ` +
      `allowed and the boundary must be re-taken afterwards.`,
  }
}

// THE CLOSING SET IS CLASSIFIED BY TARGET, NOT BY OPERATION, and that is the
// design rather than a hole in it (Sol's review of 4e93933). These files and
// scripts are precisely what a BLOCKED Stop demands of a session that has
// already committed: publish the board, file the finding it uncovered, record
// the review. Denying them would put the session back in the loop the two-phase
// boundary closes — blocked from ending, forced into a call that deletes the
// marker. What the seal denies is everything that is not ending: a commit, a
// test run, a source edit, a merge. The residual is that the closing set can be
// used for more bookkeeping than the boundary strictly needs; that costs a few
// closing calls, while the alternative costs the handover.
/** Files whose modification is part of ENDING the batch, by basename. */
export const CLOSING_SET_FILES = new Set([
  'batch-dashboard.html',
  'hoa-batch-dashboard.html',
  '.batch-dashboard.html',
  'dashboard-state.json',
  'focus-check-pending.json',
  'mechanism-reviews.jsonl',
  'batch-boundary.json',
  'batch-lock.json',
  'boundary.log',
  'tasks.md',
  'tasks-archive.md',
])

/** Scripts that exist to SATISFY a Stop guard or to run the handover itself.
 *  `board-publish` and `batch-in-flight` joined for point 675: publishing the
 *  handover card IS ending (its absence from this list was one of the measured
 *  marker deletions of 13.08.2026), and transferring/adopting the in-flight
 *  declaration is boundary bookkeeping, not batch work. */
export const CLOSING_SET_SCRIPTS = [
  'dashboard-publish',
  'dashboard-sync',
  'focus',
  'board',
  'board-queue',
  'board-publish',
  'finding',
  'mechanism-review',
  'retro-refresh',
  'batch-boundary',
  'batch-claim',
  'batch-doctor',
  'batch-handover-observe',
  'batch-in-flight',
  'batch-singleton',
  'context-watermark',
  'branch-hygiene-guard',
  'bundle-first-guard',
  'ci-status-guard',
  'container-ask-guard',
  'criticality-review-guard',
  'dashboard-guard',
  'guard-preflight',
  'mechanism-review-guard',
  'model-guard',
  'prep-guard',
  'queue-rank',
  'render-verify-guard',
  'rule-review',
]

const CLOSING_SCRIPT_RE = new RegExp(`scripts[\\\\/](?:${CLOSING_SET_SCRIPTS.join('|')})\\.mjs`, 'i')

export function isClosingSetPath(p) {
  if (typeof p !== 'string' || !p.trim()) return false
  const parts = p.replace(/\\/g, '/').toLowerCase().split('/')
  return CLOSING_SET_FILES.has(parts[parts.length - 1])
}

/**
 * A shell command counts only when EVERY one of its segments is a closing-set
 * script (bare navigation is neutral). One `git commit` or one `npm test` in the
 * chain is the session carrying on, whatever else rides along with it.
 *
 * The SEPARATOR set is the load-bearing part, and it errs toward splitting. A
 * single `&` was missing from it (four-eyes review, Fable 5): `node
 * scripts/board.mjs & npm test` then parsed as ONE segment whose head matched a
 * closing script, so the handover survived real work — the dangerous direction,
 * because a kept handover plus a long enough silence lets a successor spawn
 * beside a working session.
 *
 * A segment must also be nothing but the invocation and harmless OUTPUT
 * handling: any command substitution (`$(…)`, backticks) or redirection to a
 * file (`>`, `<`) makes it non-closing, whatever its head reads as. A descriptor
 * merge such as `2>&1` is different: it only selects where already-produced
 * output is displayed, and is removed before separators are classified.
 */
const OPAQUE_SEGMENT_RE = /\$\(|`|>|</

/**
 * Remove shell descriptor-to-descriptor OUTPUT merges before splitting on `&`.
 * They write no file and run no command. Anchoring both descriptors to decimal
 * file-descriptor syntax keeps `> result.txt`, `>& result.txt` and an arbitrary
 * ampersand expression opaque. The residual `>`/`<` check below remains the
 * authority for every other redirection.
 *
 * A SEPARATOR ENDS THE MERGE AS SURELY AS A SPACE (Claude review of a6bcd9a5):
 * `--clear 2>&1|tail -3` is the same harmless decoration as the spaced form, and
 * demanding the space would leave the very shape this point exists to unblock
 * denied for a typing habit.
 */
export function withoutOutputDescriptorMerges(command) {
  return String(command ?? '').replace(/(^|\s)\d*>>?&\d+(?=[\s;|&]|$)/g, '$1')
}

/**
 * A PURE OUTPUT PAGER — a segment that only looks at what the segment before it
 * printed (point 426 (a), measured live 29.07.2026).
 *
 * `node scripts/focus.mjs set … | tail -2` silently deleted a taken boundary: the
 * command reported "boundary recorded", the next Stop hook demanded the boundary
 * again, and nothing anywhere named the cause. Shortening the OUTPUT is not work.
 *
 * The widening is the NARROWEST one that covers "I am only looking at the output",
 * because the dangerous direction is a KEPT handover beside real work: a pager may
 * only TRAIL a closing line (never sit in the middle), a pager alone is never a
 * closing line, and the opaque-segment ban above is untouched — so `cat > file`,
 * `tail $(…)` and every redirection still count as work.
 */
export const OUTPUT_PAGERS = ['head', 'tail', 'more', 'cat']
const PAGER_SEGMENT_RE = new RegExp(`^(?:${OUTPUT_PAGERS.join('|')})(?:\\.exe)?(?:\\s|$)`, 'i')

export function isOutputPagerSegment(segment) {
  return PAGER_SEGMENT_RE.test(String(segment ?? '').trim())
}

export function isClosingSetCommand(command) {
  if (typeof command !== 'string' || !command.trim()) return false
  const segments = withoutOutputDescriptorMerges(command)
    .split(/&&|\|\||[;|&\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  let sawClosing = false
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]
    if (OPAQUE_SEGMENT_RE.test(seg)) return false
    if (/^(?:cd|set-location|pushd|popd)\b/i.test(seg)) continue
    // A pager is tolerated ONLY as the final segment of a line that has already
    // shown a closing script. In the middle it would hide whatever follows it, and
    // on its own it is not a closing line at all.
    if (i === segments.length - 1 && sawClosing && isOutputPagerSegment(seg)) continue
    const head = seg.match(/^(?:node|npx\s+node)\s+(?:"[^"]*"|'[^']*'|\S+)/i)
    if (!head || !CLOSING_SCRIPT_RE.test(head[0])) return false
    sawClosing = true
  }
  return sawClosing
}

/**
 * The triggering call, in one line for `.claude/boundary.log` (point 426 (b)).
 * PURE. Truncated, because a command line can be arbitrarily long and this is a log
 * entry, not a transcript.
 */
export const WITHDRAWAL_TRIGGER_MAX = 200

/**
 * The hook payload's own idea of WHEN the call happened, or null. PURE.
 *
 * Point 396 needs it to tell a session that is working again from a PostToolUse hook
 * that arrived late, and the payload shape is not guaranteed to carry one — so every
 * plausible field is tried and the answer may honestly be null, in which case the
 * settle window decides instead. Both a number of milliseconds and an ISO string are
 * accepted; anything else is ignored rather than guessed at.
 */
export function hookCallTimestamp(payload = {}) {
  const candidates = [
    payload?.timestamp,
    payload?.tool_use_at,
    payload?.toolUseAt,
    payload?.hook_event_at,
    payload?.tool_response?.timestamp,
  ]
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
    if (typeof v === 'string' && v.trim()) {
      const t = Date.parse(v)
      if (Number.isFinite(t) && t > 0) return t
    }
  }
  return null
}

export function describeWithdrawalTrigger({ toolName, filePath, command } = {}) {
  const tool = String(toolName ?? '').trim() || 'unknown tool'
  const clip = (s) => (s.length > WITHDRAWAL_TRIGGER_MAX ? `${s.slice(0, WITHDRAWAL_TRIGGER_MAX)}…` : s)
  const cmd = typeof command === 'string' ? command.trim().replace(/\s+/g, ' ') : ''
  if (cmd) return `${tool}: ${clip(cmd)}`
  const file = typeof filePath === 'string' ? filePath.trim() : ''
  if (file) return `${tool}: ${clip(file)}`
  return tool
}

/**
 * Does a taken boundary SURVIVE this tool call? Pure; the caller supplies the
 * PreToolUse/PostToolUse payload's tool name and target.
 * Returns { survives, reason }.
 */
export function handoverSurvivesCall({ toolName, filePath, command } = {}) {
  if (!String(toolName ?? '').trim()) return { survives: false, reason: 'unknown-tool' }
  if (typeof command === 'string' && command.trim()) {
    return isClosingSetCommand(command)
      ? { survives: true, reason: 'closing-command' }
      : { survives: false, reason: 'other-command' }
  }
  if (typeof filePath === 'string' && filePath.trim()) {
    return isClosingSetPath(filePath)
      ? { survives: true, reason: 'closing-file' }
      : { survives: false, reason: 'other-file' }
  }
  return { survives: false, reason: 'no-target' }
}

// --- WHERE THE BATCH ACTUALLY GOES (point 434 (7), found 29.07.2026 20:06) ----
//
// The boundary card said "Ich übergebe an eine frische Sitzung … Sie nimmt den
// nächsten Punkt der Warteschlange auf" while a user window held an HONOURED
// claim — and that is not what happens: `batch-autostart.mjs` reserves the batch
// for a live claim and SKIPS the spawn, so the batch goes to the claiming
// window. The text misled the user into believing his takeover had been
// overtaken by a headless successor. The card therefore READS the claim state
// and names which of the two is happening, in the German the user reads.

export const BOUNDARY_DESTINATIONS = Object.freeze({
  /** No claim: the OS launcher spawns the successor, which takes the next point. */
  FRESH_SESSION: 'fresh-session',
  /** A live claim reserves the batch: the launcher skips the spawn and the
   *  claiming window continues the work. */
  CLAIMING_WINDOW: 'claiming-window',
})

/**
 * WHO CONTINUES AFTER THIS BOUNDARY? PURE.
 *
 * `claimHonoured` is the launcher's own bail predicate — today
 * `reservationDecision(...).acquire === false`, which covers the pending claim AND
 * the released one still reserving the freed lock (point 461) — so the card cannot
 * drift from what the launcher will actually do. A claim that is merely RECORDED
 * (expired, dead, released by a claimant that is gone) reserves nothing, and the
 * card then correctly announces the fresh session.
 */
export function boundaryDestination({ claimHonoured = false, claimantSid = null } = {}) {
  const sid = typeof claimantSid === 'string' && claimantSid.trim() ? claimantSid.trim() : null
  return claimHonoured === true && sid
    ? { destination: BOUNDARY_DESTINATIONS.CLAIMING_WINDOW, claimantSid: sid }
    : { destination: BOUNDARY_DESTINATIONS.FRESH_SESSION, claimantSid: null }
}

/**
 * THE BOUNDARY CARD, in German, one text per state. PURE.
 *
 * User-facing prose (the board is read on a phone), so it says the destination in
 * the first sentence and never leaves the reader to infer it.
 *
 * IT NAMES NO POINT NUMBER (point 439, 30.07.2026). This text is prescribed for
 * use VERBATIM, and it goes into the gap card `board.mjs done <n> --none` writes
 * — a card that owns no point number, so `dashboard-card-topic-guard` counted
 * every "Punkt N" in it as a reference to a FOREIGN point and blocked the turn
 * end. Two sanctioned mechanisms thus contradicted each other, and the loser was
 * always the boundary: the block costs a turn, and every remedy command counts as
 * work and deletes the boundary marker, so the handover had to be re-taken. The
 * closed point's own story belongs in Erledigt anyway, which is where `done`
 * files it in the same edit; this card says only where the batch GOES.
 */
/**
 * THE COMMAND THAT PUTS THE BOUNDARY CARD UP. PURE.
 *
 * Two shapes, because the board can be in two states at a boundary, and printing
 * the wrong one is what sent sessions to hand-edit the file (point 470):
 *   - the closed point's card still stands → close it AND name the gap in one
 *     edit, which is what `done --none` is for;
 *   - it does not (already archived, or the tick came first) → `board.mjs none`,
 *     which needs no point at all. Before it existed there was NO sanctioned way
 *     to write this card, and a hand-edit APPENDS: three idle cards ended up
 *     stacked on the user's phone.
 * Both names come from `board-remedy`, so this instruction cannot drift from the
 * commands that actually exist.
 */
export function boundaryCardCommand({ point, pointCardStanding = false } = {}) {
  return pointCardStanding === true
    ? `${EDIT_CMD} done ${point} --none --text-stdin`
    : `${NONE_CARD_CMD} --text-stdin`
}

export function boundaryCardText({ destination, claimantSid = null, cause = BOUNDARY_CAUSES.POINT } = {}) {
  // The WATERMARK head (point 675, defeat 3): the reader must see that the
  // handover happens BECAUSE the context passed the mark, not because a point
  // closed — a card that says "der Punkt ist abgeschlossen" over a watermark
  // handover claims a closure that never happened.
  const head = BOUNDARY_CARD_HEADS[cause] ?? BOUNDARY_CARD_HEADS[BOUNDARY_CAUSES.POINT]
  if (destination === BOUNDARY_DESTINATIONS.CLAIMING_WINDOW && claimantSid) {
    // The reservation is stated with its LIMIT, not as a promise. It survives the
    // release now (point 461 — the freed lock stays that window's while its
    // process lives), so the card no longer has to warn about losing a race; but
    // it ends, and it ends silently, so the card names the two things that end it:
    // closing the window, and letting the take-up window run out. Promising more
    // would repeat, one step later, the very misdirection this card was rewritten
    // to remove (four-eyes review, finding 2).
    return (
      `${head} Der Stapel geht NICHT an eine frische Sitzung: Fenster ${claimantSid} hat ihn beansprucht, der ` +
      'Launcher hält den Start deshalb zurück und reserviert den Stapel für dieses Fenster. Weitergearbeitet ' +
      `wird dort, sobald es den Anspruch einlöst (\`node scripts/batch-claim.mjs --session ${claimantSid}\`). ` +
      'Die Reservierung bleibt auch nach der Freigabe bestehen, solange dieses Fenster offen ist — kein ' +
      'Launcher-Lauf und keine andere Sitzung nimmt sie ihm beim Rundenende weg. Wird sie innerhalb der ' +
      'Übernahmefrist nicht eingelöst oder das Fenster geschlossen, greift die gewöhnliche Übergabe — der ' +
      'Stapel bleibt nie ohne Eigentümer. ' +
      'Hier läuft nichts weiter.'
    )
  }
  return (
    `${head} Ich übergebe an eine frische Sitzung: Der Launcher startet sie innerhalb seines Intervalls, und ` +
    'sie nimmt den nächsten Punkt der Warteschlange auf. Kein Fenster hat den Stapel beansprucht. Hier läuft ' +
    'nichts weiter.'
  )
}

/**
 * Should the recorded boundary be honoured, and if not, why? Returns
 *   'allow-boundary'  — end the session here; the launcher brings up the next one
 *   'block-launcher'  — a valid boundary but nothing would restart the batch
 *   null              — no boundary claimed (the caller falls through to its
 *                       ordinary decision)
 */
export function boundaryVerdict({ boundary, launcher }) {
  if (!boundary || boundary.reason === 'no-marker') return null
  if (!boundary.valid) return null
  return launcher === 'armed' ? 'allow-boundary' : 'block-launcher'
}
