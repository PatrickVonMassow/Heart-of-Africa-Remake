// THE ESCALATION LADDER (point 434, the remainder of part 1) — the pure half.
//
// WHY. `.github/workflows/batch-watchdog.yml` alerts every 30 minutes while the
// repository has not moved, and it shares the ntfy topic with the CI-red alert.
// An alert that repeats unchanged every half hour is an alert that gets slept
// through: by the fourth identical buzz it carries no information, and the one
// thing it must not do — get quieter over the night — is exactly what it does to
// a reader. The night of 29./30.07.2026 ended with a stopped batch and a phone
// that had been notified.
//
// So a REPEATED IDENTICAL alert does not repeat identically. It climbs:
//
//   rung 0  send immediately          — the first time the condition is seen
//   rung 1  not before 15 min later
//   rung 2  not before 30 min later
//   rung 3  not before 60 min later   — priority rises with the rung
//   rung 4  not before 120 min later  — AND THE BATCH PAUSES, with a board card
//   above   silence: the batch is paused and the reason is written down
//
// Four buzzes over ~3.5 hours instead of eight identical ones, then a state the
// morning reader cannot miss. The LAST RUNG IS THE POINT: an alert can be slept
// through, a paused batch with a card explaining itself cannot.
//
// WHAT COUNTS AS "IDENTICAL". The watchdog's message carries a rising minute
// count, so a byte comparison would call every buzz a new alert and the ladder
// would never leave rung 0. Digit runs therefore collapse in the key: "stalled
// for 121 minutes" and "stalled for 151 minutes" are ONE alert, "CI is red" is
// another.
//
// FAIL-OPEN MEANS SEND. Everywhere else in this repository fail-open means "let
// the session act". On an alerting path it means DELIVER: an escalation state
// that cannot be read must never swallow a message. The I/O half enforces that;
// this half only decides.

/** The minimum gap before the next send at each rung. Index = rung = how many
 *  identical alerts have already gone out. The last entry is the PAUSE rung. */
export const ALERT_GAPS_MS = [0, 15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000, 120 * 60 * 1000]

/** The last rung — reaching it pauses the batch instead of buzzing again. */
export const ALERT_PAUSE_RUNG = ALERT_GAPS_MS.length - 1

/** ntfy priority per rung. Rising, so the fourth buzz does not look like the
 *  first one on a lock screen. */
export const ALERT_PRIORITIES = ['default', 'default', 'high', 'high', 'urgent']

/** With no identical alert for this long, the condition is taken to have cleared
 *  and the ladder starts from the bottom again. Deliberately longer than the top
 *  gap: a condition that flaps just under the ceiling must still climb. */
export const ALERT_RESET_MS = 6 * 60 * 60 * 1000

/** ntfy priorities, weakest first. */
export const PRIORITY_ORDER = ['min', 'low', 'default', 'high', 'urgent']

export function priorityRank(p) {
  const i = PRIORITY_ORDER.indexOf(String(p))
  return i < 0 ? PRIORITY_ORDER.indexOf('default') : i
}

/** The ladder may only ever RAISE a caller's priority, never lower it — a
 *  capability-breach alert stays urgent on its first send even though rung 0's
 *  own priority is "default". */
export function higherPriority(a, b) {
  if (!PRIORITY_ORDER.includes(String(a))) return b ?? a
  if (!PRIORITY_ORDER.includes(String(b))) return a
  return priorityRank(a) >= priorityRank(b) ? a : b
}

/**
 * THE PAUSE RUNG IS FOR CONDITIONS, NOT FOR EVENTS (four-eyes review, blocker).
 *
 * The ladder's premise — "the same alert again means the same condition is still
 * unanswered" — holds for the watchdog's "nothing has moved", for CI-red and for
 * a wedged owner. It is FALSE for an EVENT notification: `batch-autostart` posts
 * "Resurrected" on every successor spawn, which under the context-boundary
 * policy is the designed HEALTHY flow several times a night, and its text is
 * identical once digit runs collapse. Simulated at a 45-minute point cadence it
 * reaches the last rung after ~5 hours and would pause a perfectly healthy batch
 * — the exact opposite of this layer's purpose, and the 6-hour reset never fires
 * on a busy night.
 *
 * So pausing requires the CALLER's own declared priority to be at least this.
 * An event notification is posted at `low`/`default` and therefore CANNOT pause:
 * it throttles at the top gap and keeps going out for as long as it recurs,
 * rather than either pausing or falling permanently silent. Condition-shaped
 * callers already post at `high`/`urgent`. The gate reads the CALLER's priority,
 * never the rung's own raised one, which would defeat it.
 */
export const PAUSE_MIN_PRIORITY = 'high'

/** Keeps a title's last word and a message's first word from merging into one
 *  token — two alerts that differ only at that seam stay two alerts. */
const SEPARATOR = ' | '

/**
 * The identity of an alert. Case-folded, whitespace-collapsed, and with every
 * digit run replaced — "no push for 121 minutes" and "no push for 151 minutes"
 * are the same alert, which is the whole reason the ladder can climb at all.
 * A caller that knows better passes its own key.
 */
export function alertKey(title, message = '') {
  return [title ?? '', message ?? ''].join(SEPARATOR)
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

/** The ladder entry for a key, defaulted and defensive — a hand-edited or
 *  half-written state document must not decide anything. */
export function ladderEntry(state, key) {
  const e = state?.alerts?.[key]
  if (!e || typeof e !== 'object') return null
  const lastSentAt = Number(e.lastSentAt)
  if (!Number.isFinite(lastSentAt)) return null
  const rung = Number(e.rung)
  return {
    rung: Number.isFinite(rung) && rung >= 0 ? Math.floor(rung) : 0,
    lastSentAt,
    firstSentAt: Number.isFinite(Number(e.firstSentAt)) ? Number(e.firstSentAt) : lastSentAt,
    sends: Number.isFinite(Number(e.sends)) ? Number(e.sends) : 0,
  }
}

/**
 * THE DECISION. Pure.
 *
 * @returns {{action:'send'|'suppress'|'pause-and-send', rung:number, nextRung:number,
 *            priority:string, dueInMs:number, reason:string, reset:boolean}}
 */
export function escalationDecision({
  key,
  now = Date.now(),
  entry = null,
  paused = false,
  // The CALLER's own declared priority — the gate on the pause rung reads this,
  // never the rung's raised one. See PAUSE_MIN_PRIORITY.
  priority = 'default',
  pauseMinPriority = PAUSE_MIN_PRIORITY,
  gaps = ALERT_GAPS_MS,
  resetMs = ALERT_RESET_MS,
  priorities = ALERT_PRIORITIES,
} = {}) {
  const pauseRung = gaps.length - 1
  const mayPause = priorityRank(priority) >= priorityRank(pauseMinPriority)

  // PRIORITY ESCALATION AND THE PAUSE ARE ONE LADDER, so an alert that may not
  // pause has no business buzzing at urgent either (four-eyes re-review). Below
  // the threshold the alert is an EVENT: it is throttled, but delivered at the
  // caller's OWN priority — otherwise the launcher's "Resurrected" would reach
  // the phone at urgent every two hours while the module's own contract calls it
  // routine. Above the threshold the rung raises as before.
  const prio = (rung) => (mayPause ? (priorities[Math.min(rung, priorities.length - 1)] ?? 'default') : priority)

  if (!entry) {
    return { key, action: 'send', rung: 0, nextRung: 1, priority: prio(0), dueInMs: 0, reset: false, reason: 'first time this alert is raised' }
  }

  // A CLOCK THAT JUMPED BACKWARDS must not lock the channel: treat a
  // last-sent-in-the-future entry as if it were now.
  const lastSentAt = Math.min(entry.lastSentAt, now)
  const since = now - lastSentAt

  if (since >= resetMs) {
    return { key, action: 'send', rung: 0, nextRung: 1, priority: prio(0), dueInMs: 0, reset: true, reason: `the same alert last went out ${Math.round(since / 60000)} min ago — the condition is treated as cleared and the ladder restarts` }
  }

  const rung = entry.rung
  if (rung > pauseRung) {
    return { key, action: 'suppress', rung, nextRung: rung, priority: prio(rung), dueInMs: Infinity, reset: false, reason: 'the ladder is at its top: the batch is paused for this alert and the board card names why — repeating the buzz adds nothing' }
  }

  const gap = gaps[Math.min(rung, gaps.length - 1)]
  if (since < gap) {
    return { key, action: 'suppress', rung, nextRung: rung, priority: prio(rung), dueInMs: gap - since, reset: false, reason: `identical alert sent ${Math.round(since / 60000)} min ago; rung ${rung} is not due for another ${Math.round((gap - since) / 60000)} min` }
  }

  if (rung === pauseRung) {
    // AN EVENT-SHAPED ALERT NEVER PAUSES and never goes permanently silent: it
    // settles at the top gap and keeps recurring. Staying ON the last rung
    // (nextRung === pauseRung) is what makes that a ceiling rather than a cliff.
    if (!mayPause) {
      return { key, action: 'send', rung, nextRung: pauseRung, priority: prio(rung), dueInMs: 0, reset: false, reason: `ceiling: an alert raised at "${priority}" is an EVENT, not an unanswered condition — it throttles to one every ${Math.round(gaps[pauseRung] / 60000)} min and never pauses the batch` }
    }
    return paused
      ? { key, action: 'send', rung, nextRung: rung + 1, priority: prio(rung), dueInMs: 0, reset: false, reason: 'last rung reached, and the batch is ALREADY paused — the alert goes out, the pause is not re-applied' }
      : { key, action: 'pause-and-send', rung, nextRung: rung + 1, priority: prio(rung), dueInMs: 0, reset: false, reason: `last rung: this alert has gone unanswered through ${rung} risings — the batch pauses so it cannot be slept through` }
  }

  return { key, action: 'send', rung, nextRung: rung + 1, priority: prio(rung), dueInMs: 0, reset: false, reason: `rung ${rung}: the condition is still there ${Math.round(since / 60000)} min later` }
}

/** Book a delivered alert on the ladder — pure state transition. Entries that
 *  have not been touched for two reset windows are dropped, so the file cannot
 *  grow without bound. */
export function advanceLadder(state, { key, decision, now = Date.now(), resetMs = ALERT_RESET_MS }) {
  const alerts = state?.alerts && typeof state.alerts === 'object' ? { ...state.alerts } : {}
  for (const [k, e] of Object.entries(alerts)) {
    const at = Number(e?.lastSentAt)
    if (!Number.isFinite(at) || now - at > 2 * resetMs) delete alerts[k]
  }
  const prev = ladderEntry(state, key)
  alerts[key] = {
    rung: decision.nextRung,
    lastSentAt: now,
    firstSentAt: decision.reset || !prev ? now : prev.firstSentAt,
    sends: (decision.reset || !prev ? 0 : prev.sends) + 1,
  }
  return { alerts }
}

/** Forget one alert's ladder — the condition cleared and somebody said so. */
export function clearLadder(state, key) {
  const alerts = state?.alerts && typeof state.alerts === 'object' ? { ...state.alerts } : {}
  delete alerts[key]
  return { alerts }
}

/** The German pause text for the last rung — the morning reader's sentence. */
export function escalationPauseReason(title, decision, stamp) {
  return (
    `Eskalation: Die Meldung „${title}“ wurde ${decision.rung + 1} Mal mit steigendem Abstand gesendet und blieb unbeantwortet. ` +
    `Der Batch pausiert deshalb absichtlich — eine Benachrichtigung kann man verschlafen, einen pausierten Batch nicht. ` +
    `Er läuft weiter, sobald die Pause-Datei .claude/batch-paused gelöscht wird. ` +
    `[${stamp}]`
  )
}

/** One English line for the log. */
export function describeEscalation(decision) {
  return `${decision.action} (rung ${decision.rung} → ${decision.nextRung}, ${decision.priority}) — ${decision.reason}`
}
