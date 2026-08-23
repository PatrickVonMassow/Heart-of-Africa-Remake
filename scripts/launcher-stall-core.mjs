// Pure decision core of the launcher's OWN stall alarm (point 859).
//
// WHY THIS EXISTS (measured 23.08.2026). From 11:22 the container sickened:
// every node spawn timed out (`spawnSync ETIMEDOUT`), the network dropped, and
// the batch did NOTHING until the user's manual restart at 14:56 — 3.5 hours.
// The launcher daemon LIVED through all of it and logged `tick exceeded
// 900000 ms — killed` three times, but a dead tick only wrote a log line:
// every alert path (notify via batch-autostart, the watchdogs) runs INSIDE a
// child process, and children were exactly what the sick container could not
// start. The one process that was provably alive had no voice.
//
// So the daemon judges its own ticks with this core and sends the alert
// IN-PROCESS — `notify()` is an HTTPS POST from the daemon itself, no child
// involved. The judgement is pure and total so the incident's own shapes are
// unit fixtures; everything impure (the clock, the send) stays in
// scripts/batch-launcher.mjs.
//
// WHAT COUNTS AS DEAD. `runBatchTick` resolves a NUMBER when the tick process
// ran to an exit — whatever it decided, the container can spawn, so the batch
// has its ordinary machinery and its ordinary alerts back. It resolves NULL in
// exactly three shapes: the spawn failed, the child errored, or it hung past
// its budget and was killed. All three mean "the launcher could not get one
// working child through", which is the voiceless state this core exists for.
//
// THE ALERT REPEATS BY DESIGN, THE LADDER THROTTLES IT. A send can fail — the
// incident's network was down while the host dozed — and `notify()` books an
// escalation rung only on a CONFIRMED delivery. So this core keeps demanding
// the alert on every dead tick at or past the threshold, and the escalation
// ladder (scripts/alert-escalation-core.mjs) decides which of those demands
// actually goes out. Collapsed digits in the ladder key make "dead for 31 min"
// and "dead for 46 min" ONE climbing alert, not a fresh one each tick.

/** Consecutive dead ticks before the first alert. One dead tick is a slow
 *  machine or an unlucky kill; two whole intervals without one working child
 *  is the measured incident. */
export const STALL_ALERT_AFTER = 2

/** A sleep that overshoots its plan by more than one whole interval marks a
 *  SUSPEND (the host slept or froze — timers cannot overshoot that far on a
 *  healthy machine). After one, the very FIRST dead tick alerts: the incident
 *  showed a container that comes back sick from a suspend, and waiting out
 *  the ordinary threshold there costs another quarter hour of silence. */
export const SUSPEND_OVERSHOOT_MS_MIN = 5 * 60 * 1000

/** The state the daemon threads through `judgeTick`. `deadSinceAt` is the time
 *  of the first dead tick of the current run (epoch ms), for the human-readable
 *  duration in the alert. */
export function initialStallState() {
  return { deadRun: 0, deadSinceAt: null, alerted: false, suspended: false }
}

/**
 * ONE SLEEP JUDGED: did the host sleep through it? PURE, TOTAL.
 *
 * `plannedMs` is what the daemon meant to sleep (never more than the tick
 * interval; an early wake makes the actual shorter, which is fine). The
 * overshoot must clear BOTH bars — one whole interval AND five minutes — so a
 * short debug interval in a test cannot call every scheduling hiccup a
 * suspend, and a production interval is not flagged by ordinary event-loop
 * lag either.
 */
export function judgeSleep({ state, plannedMs, actualMs, tickMs } = {}) {
  const overshoot = Number(actualMs) - Number(plannedMs)
  const bar = Math.max(Number(tickMs) || 0, SUSPEND_OVERSHOOT_MS_MIN)
  if (!Number.isFinite(overshoot) || overshoot <= bar) return { state, log: null }
  return {
    state: { ...state, suspended: true },
    log: `sleep overshot by ${Math.round(overshoot / 60000)} min — host suspend assumed; the next dead tick alerts immediately`,
  }
}

/**
 * ONE TICK JUDGED: what must the daemon say, in its own voice? PURE, TOTAL.
 *
 * Returns { state, alert, recovery, log }:
 *   alert    — { title, message, priority, key } to hand to notify() through
 *              the ladder, or null. Demanded on EVERY dead tick at/past the
 *              threshold (see the header: the ladder throttles, a failed send
 *              retries by construction).
 *   recovery — a one-time { title, message, priority } after an alerted run
 *              ends with a working tick, or null. Sent OUTSIDE the ladder:
 *              it happens once per episode by construction and is the news
 *              that stands the standing alert down.
 *   log      — a line for the launcher log, or null.
 */
export function judgeTick({ state, alive, now } = {}) {
  const s = state && typeof state === 'object' ? state : initialStallState()
  if (alive === true) {
    const recovered = s.alerted === true
    const minutes = s.deadSinceAt ? Math.max(1, Math.round((Number(now) - s.deadSinceAt) / 60000)) : 0
    return {
      state: initialStallState(),
      alert: null,
      recovery: recovered
        ? {
            title: 'Batch drive recovered',
            message:
              `The first tick got a working child through again after ${s.deadRun} dead attempt(s) ` +
              `(${minutes} min without one). The ordinary machinery and its own alerts are back.`,
            priority: 'default',
          }
        : null,
      log: recovered ? `stall over — first working tick after ${s.deadRun} dead one(s)` : null,
    }
  }
  const deadRun = (Number.isInteger(s.deadRun) && s.deadRun >= 0 ? s.deadRun : 0) + 1
  const deadSinceAt = s.deadSinceAt ?? Number(now)
  const threshold = s.suspended === true ? 1 : STALL_ALERT_AFTER
  const minutes = Math.max(1, Math.round((Number(now) - deadSinceAt) / 60000))
  const alert =
    deadRun >= threshold
      ? {
          title: 'Batch drive is STALLED',
          message:
            `The launcher daemon is alive but cannot get a working child through: ${deadRun} tick(s) ` +
            `in a row failed to spawn, errored or hung past their budget` +
            (deadRun > 1 ? ` — dead for ${minutes} min now` : '') +
            (s.suspended === true ? ', right after a host suspend' : '') +
            '. Nothing advances the batch and no other alert path can run. ' +
            'Most likely the container is sick: restart VS Code (rebuilds the container) when you can.',
          priority: 'high',
          // One climbing alert per stall episode: the ladder collapses digit
          // runs itself, but the counters here would still make new keys —
          // so the key is fixed, and fixed per EPISODE by construction
          // (recovery resets the run, and the ladder key with it).
          key: 'launcher-stall',
        }
      : null
  return {
    state: { ...s, deadRun, deadSinceAt, alerted: s.alerted || alert !== null },
    alert,
    recovery: null,
    log: alert === null ? `dead tick ${deadRun}/${threshold} — alerting at ${threshold}` : null,
  }
}
