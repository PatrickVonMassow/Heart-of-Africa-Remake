// THE FINDINGS CARRIER BELL — the deciding half. PURE: no I/O and no clock of
// its own. The PostToolUse delivery calls this with the carrier's pending
// findings and persists the returned state before it emits the returned line.
//
// Injected context is paid for again on every later request, so silence is the
// common result: an empty carrier costs zero bytes, an unchanged reminder is
// rate-limited, and a chat message gets the call to itself. A rising count is
// different evidence — another finding arrived — and rings immediately.

/** The single cadence for an ignored finding. */
export const REMINDER_INTERVAL = 15 * 60 * 1000

const usableNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : null)

/** Only durable scalar data crosses the process boundary in the reminder file. */
export function carrierBellState(value = {}) {
  return {
    lastReminderAt: usableNumber(value?.lastReminderAt),
    lastWaitingCount: Math.max(0, Math.floor(usableNumber(value?.lastWaitingCount) ?? 0)),
    deferred: value?.deferred === true,
  }
}

const waitingFindings = (waiting) => (Array.isArray(waiting) ? waiting.filter((entry) => entry && typeof entry === 'object') : [])

/** Pick the chronologically oldest usable timestamp, preserving carrier order
 * as the fallback for a malformed hand-written timestamp. */
export function oldestFinding(waiting = []) {
  const list = waitingFindings(waiting)
  if (list.length === 0) return null
  let oldest = list[0]
  let oldestAt = Date.parse(String(oldest.at ?? ''))
  for (const entry of list.slice(1)) {
    const at = Date.parse(String(entry.at ?? ''))
    if (Number.isFinite(at) && (!Number.isFinite(oldestAt) || at < oldestAt)) {
      oldest = entry
      oldestAt = at
    }
  }
  return oldest
}

/** Exactly one context line: count, oldest timestamp and title, then the one
 * command that lets the owner inspect the carrier before draining an entry. */
export function renderCarrierBell(waiting = []) {
  const list = waitingFindings(waiting)
  const oldest = oldestFinding(list)
  if (!oldest) return ''
  const at = String(oldest.at ?? 'unknown time').replace(/\s+/g, ' ').trim() || 'unknown time'
  const title = String(oldest.title ?? '').replace(/\s+/g, ' ').trim()
  return `FINDINGS CARRIER: ${list.length} waiting; oldest [${at}] ${JSON.stringify(title)}. Drain: node scripts/finding.mjs --drain`
}

/**
 * Decide whether this call rings, and return the state the I/O shell must
 * persist. `chatDelivered` defers a due bell without marking it delivered, so
 * the user's own words take this call and the bell takes the next one.
 */
export function carrierBellDecision({
  waiting = [],
  ownsBatch = false,
  paused = false,
  chatDelivered = false,
  now = 0,
  state = {},
} = {}) {
  const previous = carrierBellState(state)
  if (!ownsBatch || paused) {
    return { line: '', state: previous, reason: paused ? 'paused' : 'not-owner' }
  }

  const list = waitingFindings(waiting)
  const count = list.length
  if (count === 0) {
    return {
      line: '',
      state: { ...previous, lastWaitingCount: 0, deferred: false },
      reason: 'empty',
    }
  }

  const at = usableNumber(now)
  const risen = count > previous.lastWaitingCount
  const intervalElapsed =
    at !== null &&
    (previous.lastReminderAt === null || at - previous.lastReminderAt >= REMINDER_INTERVAL)
  const due = previous.deferred || risen || intervalElapsed
  const observed = { ...previous, lastWaitingCount: count }
  if (!due) return { line: '', state: observed, reason: 'throttled' }
  if (chatDelivered) {
    return { line: '', state: { ...observed, deferred: true }, reason: 'chat-first' }
  }

  return {
    line: renderCarrierBell(list),
    state: { ...observed, lastReminderAt: at, deferred: false },
    reason: risen ? 'count-risen' : previous.deferred ? 'deferred' : 'interval-elapsed',
  }
}
