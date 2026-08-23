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
//   rung 3  not before 60 min later   — condition priority rises with the rung
//   rung 4  not before 120 min later  — decide once, or hold an event at its ceiling
//   above   silence: a condition's durable decision card now carries the answer
//
// Four buzzes over ~3.5 hours instead of eight identical ones, then a state the
// morning reader cannot miss. The LAST RUNG no longer manufactures a standstill:
// for a CONDITION it records the decision to continue and the user's retroactive
// veto route. A recurring EVENT stays on that rung, at the caller's own priority,
// because each occurrence is news rather than an unanswered request. Only a
// condition on the closed corruption list may still pause, because there
// continuing is the unsafe act rather than the safe floor. Event/condition shape
// and corruption authority are separate caller declarations.
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
 *  identical alerts have already gone out. The last entry is the decision rung. */
export const ALERT_GAPS_MS = [0, 15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000, 120 * 60 * 1000]

/** The last rung — reaching it resolves the unanswered alert instead of buzzing again. */
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
 * THE CLOSED LIST OF ALERT CLASSES ALLOWED TO PAUSE.
 *
 * Priority is presentation, not authority. A generic stall may be urgent and a
 * repository finding may initially be quiet; neither fact decides whether
 * continuing can damage the work. Callers therefore name the condition class,
 * and this list — beside the decision core — is the complete pause capability.
 * Unknown, absent and newly invented classes all fall toward continuation.
 */
export const CORRUPTION_ALERT_CLASSES = Object.freeze([
  'forbidden-serving-model',
  'repository-integrity',
])

const CORRUPTION_ALERT_CLASS_SET = new Set(CORRUPTION_ALERT_CLASSES)

export function isCorruptionAlertClass(alertClass) {
  return CORRUPTION_ALERT_CLASS_SET.has(String(alertClass ?? ''))
}

/** Stable card title named by the pure verdict and consumed by the I/O half. */
export function continuationDecisionCard(title = '') {
  const subject = String(title).trim().replace(/\s+/g, ' ') || 'unnamed alert'
  return `Entscheidungsprotokoll: Batch läuft weiter — ${subject}`.slice(0, 160)
}

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
 * @returns {{action:'send'|'suppress'|'pause-and-send'|'continue-and-record', rung:number,
 *            nextRung:number, priority:string, dueInMs:number, reason:string,
 *            reset:boolean, decisionCard?:string}}
 */
export function escalationDecision({
  key,
  title = '',
  now = Date.now(),
  entry = null,
  paused = false,
  priority = 'default',
  alertClass = 'generic',
  recurring = false,
  gaps = ALERT_GAPS_MS,
  resetMs = ALERT_RESET_MS,
  priorities = ALERT_PRIORITIES,
} = {}) {
  const pauseRung = gaps.length - 1
  const mayPause = isCorruptionAlertClass(alertClass)
  // Corruption authority wins if a caller makes contradictory declarations:
  // `recurring` cannot be used to downgrade a closed-list safety condition.
  const isRecurringEvent = recurring === true && !mayPause
  const prio = (rung) => isRecurringEvent
    ? priority
    : higherPriority(priority, priorities[Math.min(rung, priorities.length - 1)] ?? 'default')

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

  // A short-lived regressed build advanced recurring events above the ceiling.
  // Clamp those entries back onto it so declaring the event repairs existing
  // runtime state instead of leaving that healthy flow permanently silent.
  const rung = isRecurringEvent ? Math.min(entry.rung, pauseRung) : entry.rung
  if (rung > pauseRung) {
    return {
      key,
      action: 'suppress',
      rung,
      nextRung: rung,
      priority: prio(rung),
      dueInMs: Infinity,
      reset: false,
      reason: mayPause
        ? 'the ladder is at its top: the corruption-class alert paused the batch and its board card names why'
        : 'the ladder is at its top: the decision card records why the batch continued and how to veto that decision retroactively',
    }
  }

  const gap = gaps[Math.min(rung, gaps.length - 1)]
  if (since < gap) {
    return { key, action: 'suppress', rung, nextRung: rung, priority: prio(rung), dueInMs: gap - since, reset: false, reason: `identical alert sent ${Math.round(since / 60000)} min ago; rung ${rung} is not due for another ${Math.round((gap - since) / 60000)} min` }
  }

  if (rung === pauseRung) {
    if (isRecurringEvent) {
      return {
        key,
        action: 'send',
        rung,
        nextRung: pauseRung,
        priority: prio(rung),
        dueInMs: 0,
        reset: false,
        reason:
          `ceiling: this is a recurring EVENT, not an unanswered condition — it stays at the caller's ` +
          `"${priority}" priority, sends at most once every ${Math.round(gaps[pauseRung] / 60000)} min, ` +
          'and creates no decision card',
      }
    }
    if (!mayPause) {
      const decisionCard = continuationDecisionCard(title)
      return {
        key,
        action: 'continue-and-record',
        rung,
        nextRung: rung + 1,
        priority: prio(rung),
        dueInMs: 0,
        reset: false,
        decisionCard,
        reason:
          `last rung: "${alertClass}" is not on the closed corruption list — the batch keeps running and ` +
          `decision card "${decisionCard}" records the decision and its retroactive veto`,
      }
    }
    return paused
      ? { key, action: 'send', rung, nextRung: rung + 1, priority: prio(rung), dueInMs: 0, reset: false, reason: 'last rung reached, and the batch is ALREADY paused — the alert goes out, the pause is not re-applied' }
      : {
          key,
          action: 'pause-and-send',
          rung,
          nextRung: rung + 1,
          priority: prio(rung),
          dueInMs: 0,
          reset: false,
          alertClass,
          reason:
            `last rung: corruption class "${alertClass}" authorizes a pause because continuing could damage ` +
            'the work or propagate the corruption',
        }
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
  const alertClass = String(decision?.alertClass ?? 'unbekannte Korruptionsklasse')
  return (
    `Eskalation: Die Meldung „${title}“ wurde ${decision.rung + 1} Mal mit steigendem Abstand gesendet. ` +
    `Sie gehört zur Korruptionsklasse „${alertClass}“, die diese Pause autorisiert. ` +
    `Der Batch pausiert, weil weiteres Arbeiten den Arbeitsstand beschädigen oder die erkannte Korruption ausweiten könnte — ` +
    `hier ist Weiterarbeiten, nicht Warten, die unsichere Handlung. ` +
    `Er läuft weiter, sobald die Pause-Datei .claude/batch-paused gelöscht wird — oder von selbst, ` +
    `sobald die Restart-Uhr in dieser Datei abgelaufen ist (Punkt 445). ` +
    `[${stamp}]`
  )
}

/** One English line for the log. */
export function describeEscalation(decision) {
  return `${decision.action} (rung ${decision.rung} → ${decision.nextRung}, ${decision.priority}) — ${decision.reason}`
}
