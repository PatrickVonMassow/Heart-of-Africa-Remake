// Pure decision logic of the dashboard Stop-hook guard (dashboard-guard.mjs is
// the thin I/O wrapper). Kept side-effect-free so the Vitest layer can sweep
// every invariant without git/fs (scripts/dashboard-guard-core.test.mjs).
//
// The guard exists because reminders repeatedly failed (user mandate 21.07.2026,
// re-tightened 22.07.2026 after the now-card still said point 200 while the work
// had pivoted to point 210): every invariant here is ENFORCED at turn end, not
// suggested. Fail-open is the WRAPPER's job (any I/O error → allow); this core
// only decides on the inputs it is handed and must never throw on partial ones.

/** A focus confirmation older than this, with tool work after it, must be re-affirmed. */
export const FOCUS_FRESH_MS = 30 * 60 * 1000

/** Open/done TASKS points; DEFERRED lines are skipped (AWAITING-USER stays open). */
export function parseTasks(text) {
  const open = []
  const done = []
  if (typeof text !== 'string') return { open, done }
  for (const l of text.split('\n')) {
    let m = l.match(/^- \[ \] (\d+)\./)
    if (m && !/\bDEFERRED\b/.test(l)) open.push(Number(m[1]))
    m = l.match(/^- \[x\] (\d+)\./)
    if (m) done.push(Number(m[1]))
  }
  return { open, done }
}

/**
 * The point number in the now-card's TITLE (`<span class="t">210 — …`), taken
 * from the first title after the "Woran ich gerade arbeite" heading — never from
 * incidental mentions in the status text ("the point-200 class" falsely covered
 * 200 once). Null when the card has no leading number (non-point work) or the
 * section is missing.
 */
export function parseNowCardPoint(html) {
  if (typeof html !== 'string') return null
  const nowStart = html.indexOf('Woran ich gerade arbeite')
  if (nowStart < 0) return null
  const m = html.slice(nowStart).match(/class="t">\s*(\d+)/)
  return m ? Number(m[1]) : null
}

/** Point numbers of the Warteschlange cards only (the Erledigt section also uses `.num`). */
export function parseQueuePoints(html) {
  const queued = new Set()
  if (typeof html !== 'string') return queued
  // Anchor on the SECTION HEADER, not any mention: a now-card/card that names
  // "Warteschlange" in prose otherwise steals qStart and the slice misses the
  // real queue cards (observed 22.07.2026 — all points falsely read "missing").
  const qStart = html.indexOf('<h2>Warteschlange')
  if (qStart < 0) return queued
  const qEnd = html.indexOf('<h2>', qStart + 1)
  const queueHtml = html.slice(qStart, qEnd < 0 ? undefined : qEnd)
  for (const m of queueHtml.matchAll(/class="num">\s*(\d+)/g)) queued.add(Number(m[1]))
  return queued
}

/**
 * Point numbers of the "Von dir zu klären" cards (items blocked on the user).
 * Anchored on the SECTION HEADER like parseQueuePoints, and reading only the
 * LEADING number of each card TITLE (`<span class="t">226 — …`) — the pattern
 * parseNowCardPoint uses — never every digit: cards without a leading number
 * (the ntfy subscription, the communication-system question) are not
 * point-tied and yield nothing. Empty Set on non-string input or a missing
 * section.
 */
export function parseKlaerungPoints(html) {
  const points = new Set()
  if (typeof html !== 'string') return points
  const kStart = html.indexOf('<h2>Von dir zu klären')
  if (kStart < 0) return points
  const kEnd = html.indexOf('<h2>', kStart + 1)
  const sectionHtml = html.slice(kStart, kEnd < 0 ? undefined : kEnd)
  for (const m of sectionHtml.matchAll(/class="t">\s*(\d+)/g)) points.add(Number(m[1]))
  return points
}

const block = (reason) => ({ decision: 'block', reason })
const ALLOW = { decision: 'allow' }

/**
 * Decide whether the turn may end. Inputs (all optional — missing data errs the
 * way each invariant documents):
 *   paused            .claude/batch-paused exists
 *   open, done        parsed TASKS point numbers
 *   marker            dashboard-state.json content (or null)
 *   markerFileExists  the registered dashboardPath resolves to a real file
 *   head, html        current git HEAD; registered dashboard file content
 *   repoHash          sha256 of the registered dashboard file (null: unreadable)
 *   focus             current-focus.json content (or null)
 *   pending           focus-check-pending.json content (or null)
 *   sessionId         this session's id (from the hook's stdin JSON)
 *   lastToolAt        last tool call of THIS session (0: none known)
 *   now, freshMs      clock + focus-freshness window override
 */
export function evaluate(input) {
  const {
    paused = false,
    open = [],
    done = [],
    marker = null,
    markerFileExists = false,
    head = '',
    html = null,
    repoHash = null,
    focus = null,
    pending = null,
    sessionId = '',
    lastToolAt = 0,
    now = Date.now(),
    freshMs = FOCUS_FRESH_MS,
  } = input ?? {}

  // Batch paused or complete: no dashboard duty in flight.
  if (paused) return ALLOW
  if (!Array.isArray(open) || open.length === 0) return ALLOW

  // (1) REGISTERED — a session without a registered, existing dashboard file
  // must set one up before it may end a turn.
  if (!marker || !marker.dashboardPath || !markerFileExists) {
    return block(
      'BATCH DASHBOARD NOT REGISTERED. Bring all four dashboard sections in line with the real ' +
        'state, publish (node scripts/dashboard-publish.mjs, then the Artifact tool), declare your ' +
        'focus (node scripts/focus.mjs set <N> "<what>"), then run: node scripts/dashboard-guard.mjs ' +
        `--synced <dashboard.html path>. Open points: ${open.join(', ')}.`,
    )
  }

  // (2) FRESHNESS — a moved HEAD means work happened since the last review.
  if (head && marker.head && head !== marker.head) {
    return block(
      `BATCH DASHBOARD OUT OF DATE: HEAD moved to ${head.slice(0, 7)} since the dashboard was ` +
        `last reviewed (${String(marker.head).slice(0, 7)}). Review ALL FOUR sections against the ` +
        'current state (now-card, queue order, Erledigt), republish (dashboard-publish.mjs + ' +
        'Artifact), then run: node scripts/dashboard-guard.mjs --synced ' + marker.dashboardPath + '.',
    )
  }

  const queued = parseQueuePoints(html)
  const nowPoint = parseNowCardPoint(html)
  const klaerung = parseKlaerungPoints(html)

  // (3) NO STALE QUEUE ITEM — a ticked point must not still sit in the Warteschlange.
  const stale = done.filter((n) => queued.has(n))
  if (stale.length) {
    return block(
      `BATCH DASHBOARD STALE: point(s) ${stale.join(', ')} are ticked done in TASKS.md but still ` +
        'listed in the dashboard Warteschlange. Move them to Erledigt, republish, then re-run --synced.',
    )
  }

  // (4) COMPLETENESS — every open point is visible: queue, the now-card's own
  // title, or a "Von dir zu klären" card (a point blocked on the user lives
  // ONLY there — see 4c).
  const missing = open.filter((n) => n !== nowPoint && !queued.has(n) && !klaerung.has(n))
  if (missing.length) {
    return block(
      `BATCH DASHBOARD INCOMPLETE: open TASKS point(s) ${missing.join(', ')} appear in NEITHER the ` +
        'Warteschlange nor the now-card nor "Von dir zu klären". Add every open point to the ' +
        'dashboard (an ongoing/umbrella point still gets a queue card), republish, then re-run --synced.',
    )
  }

  // (4b) NO DOUBLE-LISTING — the now-card's own point must not ALSO sit in the
  // Warteschlange. It is "current work", not a pending queue item; listing it in
  // both reads as simultaneously in-progress AND waiting. Observed 22.07.2026:
  // point 214 stood in the now-card and the queue at once (user-reported
  // inconsistency). Enforced so the contradiction cannot recur.
  if (nowPoint != null && queued.has(nowPoint)) {
    return block(
      `BATCH DASHBOARD DOUBLE-LISTS point ${nowPoint}: it is BOTH the now-card ("Woran ich gerade ` +
        'arbeite") AND has a Warteschlange card. The current-work point must appear ONLY in the ' +
        'now-card — delete its Warteschlange card, republish (dashboard-publish.mjs + Artifact), then ' +
        're-run --synced.',
    )
  }

  // (4c) ONE SECTION PER POINT — a point number may appear in AT MOST ONE of
  // the three open sections (now-card, Warteschlange, "Von dir zu klären"),
  // and a DONE point in none of them. (3) polices done∈queue and (4b)
  // now∈queue; this adds every "Von dir zu klären" overlap: a point that is
  // queued as pending work, or IS the current now-card focus, or is ticked
  // done, is not (purely) "waiting on the user" — its VDZK card is stale or
  // the point is double-listed. User-reported twice for the answered-question
  // case (the card lingered after work resumed) and once for point 206
  // standing in the Warteschlange AND under "Von dir zu klären" at once.
  const klaerungOverlaps = [...klaerung]
    .map((n) => {
      const also = []
      if (queued.has(n)) also.push('Warteschlange')
      if (nowPoint != null && n === nowPoint) also.push('now-card')
      if (done.includes(n)) also.push('ticked done')
      return also.length ? `${n} (also: ${also.join(' + ')})` : null
    })
    .filter(Boolean)
  if (klaerungOverlaps.length) {
    return block(
      `BATCH DASHBOARD DOUBLE-LISTS "VON DIR ZU KLÄREN" point(s) ${klaerungOverlaps.join('; ')}. ` +
        'A point belongs in exactly ONE section: blocked on the user → ONLY under "Von dir zu ' +
        'klären" (delete its Warteschlange card); being worked → the now-card (delete its VDZK ' +
        'card); done → only Erledigt. Fix the card(s), republish (dashboard-publish.mjs + ' +
        'Artifact), then re-run --synced.',
    )
  }

  // (5) FOCUS DECLARED — the machine cannot know what you are doing; you must
  // SAY it, so the card can be held against the declaration.
  if (!focus || (focus.point == null && !focus.note)) {
    return block(
      'CURRENT FOCUS NOT DECLARED. Declare what you are working on RIGHT NOW: node scripts/focus.mjs ' +
        'set <pointNumber> "<one line>" ("-" for non-point work such as a closing cycle). The dashboard ' +
        'now-card must name the same work; update + republish it first if it does not.',
    )
  }

  // (6) NOW-CARD == FOCUS — the exact 200-vs-210 slip: the card's title point
  // must equal the declared focus point. (A null focus point — non-point work —
  // skips the number equality; the pivot ritual in (7) still applies.)
  if (focus.point != null && nowPoint !== focus.point) {
    return block(
      `DASHBOARD NOW-CARD OUT OF SYNC WITH THE DECLARED FOCUS: the now-card is titled point ` +
        `${nowPoint ?? '<none parseable>'} but the declared focus is ${focus.point} ("${focus.note ?? ''}"). ` +
        'Reconcile NOW: if the work really moved, rewrite the now-card (and queue), republish ' +
        '(dashboard-publish.mjs + Artifact) and re-run --synced; if the declaration is the stale side, ' +
        'run node scripts/focus.mjs set <N> "<what>".',
    )
  }

  // (7) PIVOT RECONCILE — every user prompt may have pivoted the work (the
  // 200→210 pivot came from a user question). The UserPromptSubmit hook arms
  // this marker; the turn may not end until the focus was explicitly confirmed
  // or re-set (focus.mjs confirm/set, or a full --synced review). Only THIS
  // session's marker binds — a parallel chat window is not dragged in.
  if (pending && (!pending.sessionId || !sessionId || pending.sessionId === sessionId)) {
    return block(
      'FOCUS RECONCILE REQUIRED: a user prompt arrived this turn and may have changed what you are ' +
        'working on. Check the dashboard now-card against what you are ACTUALLY doing right now, then ' +
        'acknowledge: node scripts/focus.mjs confirm (unchanged) — or node scripts/focus.mjs set <N> ' +
        '"<what>" plus a now-card update + republish + --synced (changed). Enforced because reminders ' +
        'alone repeatedly failed.',
    )
  }

  // (8) FOCUS FRESHNESS — a long stretch of tool work with no re-affirmation
  // means the card's status may have drifted. Re-affirm at most every freshMs
  // while actually working (no nag on idle/pure-chat stretches).
  const confirmedAt = Number(focus.confirmedAt ?? focus.setAt ?? 0)
  if (lastToolAt > confirmedAt && now - confirmedAt > freshMs) {
    const min = Math.round((now - confirmedAt) / 60000)
    return block(
      `FOCUS RE-AFFIRMATION REQUIRED: ~${min} min of work since the focus/now-card was last ` +
        'confirmed. Verify the now-card still shows the live sub-state (fresh "Status (Stand HH:MM)" ' +
        'line) — refresh + republish + --synced if not — then run node scripts/focus.mjs confirm.',
    )
  }

  // (9) PUBLISHED — "I updated the file" must not masquerade as "it is live".
  // The repo dashboard's bytes must equal the content last handed to the
  // Artifact tool (recorded automatically by the PostToolUse heartbeat), or be
  // covered by an explicit, logged deferral (headless sessions without the
  // Artifact tool). An unreadable repo file yields repoHash null → skip
  // (fail-open; invariant 1 already covers a missing file).
  if (repoHash) {
    const deferred = marker.publishDeferred
    const covered =
      (marker.publishedHash && marker.publishedHash === repoHash) ||
      (deferred && deferred.repoHash === repoHash)
    if (!covered) {
      return block(
        'DASHBOARD EDITED BUT NOT REPUBLISHED: the repo dashboard file does not match the content ' +
          'last published via the Artifact tool' +
          (marker.publishedHash ? '' : ' (no publish recorded yet)') +
          '. Publishing is part of EVERY dashboard update: run node scripts/dashboard-publish.mjs, ' +
          'publish the synced scratchpad file with the Artifact tool (same artifact url), then re-run ' +
          '--synced. ONLY if the Artifact tool is genuinely unavailable in this session (headless run): ' +
          'node scripts/dashboard-publish.mjs --defer "<reason>" — and republish at the first chance.',
      )
    }
  }

  return ALLOW
}
