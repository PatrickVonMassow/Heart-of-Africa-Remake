// THE BOARD REACHABILITY PROBE — pure decision core (point 562).
//
// WHY THIS EXISTS. On 08.08.2026 at 13:39 the launcher's board probe reported
// `board: unreachable — fetch failed`, the escalation ladder climbed its five
// rungs and PAUSED the whole batch. The board was never gone:
// `.claude/batch-launcher.log` shows those failures INTERLEAVED with successful
// probes of the same URL (lines 1114 and 1136 sit after already-green ones), a
// counter-probe from the same container answered HTTP 200 at the same minute —
// with and without `--dns-result-order=ipv4first` — and
// `board-publish.mjs --check` reported CURRENT throughout. A sporadic network
// hiccup stopped every point in the queue, and the alert that fetched the user
// out of his weekend reported something untrue.
//
// FOUR RULES, and they are the whole module:
//
// 1. A TRANSPORT FAILURE AND A STALE BOARD ARE NOT THE SAME CLAIM. A fetch that
//    failed says nothing about the board's CURRENCY; only staleness is worth
//    waking anybody for. The two get different verdicts, different titles and —
//    because the ladder keys on the title and message — different rungs.
// 2. A FAILED PROBE IS RETRIED AT ONCE, briefly spaced, before it counts as
//    anything. A success at ANY attempt makes the probe a success.
// 3. THE ESCALATION COUNTS ONLY CONSECUTIVE FAILURES. One success anywhere in
//    the chain resets the count to zero, so an alternating sequence — which is
//    exactly what the log showed — can never climb.
// 4. THE PAUSE STAYS THE LAST STAGE FOR A GENUINELY UNREACHABLE BOARD, and only
//    for that. Two independent transports are asked: the CURRENCY transport
//    (raw.githubusercontent.com, which carries the fingerprint) and the VIEWER
//    the reader opens (the Pages host). While EITHER still answers, the board is
//    reachable and the failure is a transport hiccup — reported at a priority the
//    escalation ladder may never pause on (`PAUSE_MIN_PRIORITY` in
//    scripts/alert-escalation-core.mjs). Both failing together is what an outage
//    looks like, and that one still climbs to the pause.
//
// Side-effect free, so scripts/board-probe-core.test.mjs can sweep every rule
// without a network. The fetching half is scripts/board-watchdog.mjs.

/** How often ONE probe is attempted before it counts as a failure. Two: the
 *  measured fault was a single flickering attempt, and a second one costs a
 *  couple of seconds against a batch-wide pause. Calibratable. */
export const PROBE_ATTEMPTS = 2

/** The spacing between the attempts of one probe. Brief on purpose — this sits
 *  inside a launcher tick, and a DNS/socket flicker is over in milliseconds.
 *  Calibratable. */
export const PROBE_RETRY_DELAY_MS = 2000

/**
 * How many CONSECUTIVE fully-failed probes (both transports, both attempts) make
 * an unreachable board a claim worth reporting.
 *
 * Two, i.e. half an hour of silence at the 15-minute tick. One tick is what the
 * incident produced from a flicker; two consecutive ticks in which neither host
 * answers twice is no longer a flicker on any reading. Calibratable — raising it
 * delays a real outage report by one tick, lowering it re-admits the flicker.
 */
export const UNREACHABLE_STREAK = 2

const isOk = (a) => !!(a && typeof a === 'object' && a.ok === true)

/**
 * Fold the attempts of ONE probe into one result. PURE.
 *
 * A SUCCESS ANYWHERE WINS (rule 2): "a single failure followed by a successful
 * retry is not counted" is this line and nothing else. The errors are kept for
 * the message — a probe that only succeeded on its second attempt is still worth
 * naming in a log, it is simply not a fault.
 *
 * `attempts` is an array of { ok, error?, body? }. An empty or unusable array is
 * a failure with no error text: a probe that never ran cannot have succeeded.
 */
export function probeResult(attempts) {
  const list = Array.isArray(attempts) ? attempts : []
  const good = list.find(isOk) ?? null
  const errors = list.filter((a) => !isOk(a)).map((a) => String(a?.error ?? 'fetch failed'))
  return {
    ok: good !== null,
    body: good && typeof good.body === 'string' ? good.body : null,
    attempts: list.length,
    // A retry that RESCUED the probe — the caller logs it, nobody is alerted.
    rescued: good !== null && errors.length > 0,
    error: good !== null ? null : errors[errors.length - 1] ?? 'the probe never ran',
    errors,
  }
}

/**
 * WHICH OF THE TWO HAPPENED? PURE, and the whole of rules 1 and 4.
 *
 * `currency` is the probe of the transport that carries the fingerprint
 * (raw.githubusercontent.com); `viewer` is the probe of the page the reader
 * actually opens (the Pages host), or null when it was not asked — which is the
 * normal case, because it is only asked once the currency probe has failed.
 *
 * Returns 'reachable' | 'transport' | 'unreachable'. The classification is
 * symmetric on purpose: whichever of the two answered, the board IS reachable
 * and the other one's failure is a transport fault, never a claim about the
 * board's content. Only both failing is an outage.
 */
export function classifyBoardProbe({ currency = null, viewer = null } = {}) {
  const c = isOk(currency)
  const v = viewer === null || viewer === undefined ? null : isOk(viewer)
  if (c) return v === false ? 'transport' : 'reachable'
  if (v === true) return 'transport'
  return 'unreachable'
}

/**
 * THE STREAK. PURE (rule 3).
 *
 * Only a fully failed probe advances it; 'reachable' AND 'transport' both reset
 * it, because both mean something answered. That is what makes an alternating
 * failure/success sequence unable to climb, however long it runs.
 */
export function nextFailureStreak({ streak = 0, kind = 'reachable' } = {}) {
  const prev = Number.isFinite(Number(streak)) && Number(streak) > 0 ? Math.floor(Number(streak)) : 0
  return kind === 'unreachable' ? prev + 1 : 0
}

/**
 * THE PROBE'S VERDICT, in the vocabulary `watchdogDecision` speaks. PURE, TOTAL.
 *
 * Verdicts this adds to the currency ones ('current' / 'behind' / 'settling' /
 * 'unknown'):
 *   'transport'   — a fetch failed while the other transport answered. Reported,
 *                   at a priority the ladder may never pause on, and NEVER as a
 *                   statement about the board's currency.
 *   'flaky'       — everything failed, but not yet for `threshold` consecutive
 *                   probes. Logged by the caller, reported to nobody: one tick
 *                   of silence is the flicker this point was written for.
 *   'unreachable' — everything failed, for `threshold` consecutive probes. The
 *                   genuine outage, and the one that still climbs to the pause.
 *
 * `streak` is the count AFTER this probe (i.e. `nextFailureStreak`'s answer), so
 * the caller keeps exactly one number between ticks.
 */
export function probeVerdict({
  kind = 'reachable',
  streak = 0,
  threshold = UNREACHABLE_STREAK,
  currency = null,
  viewer = null,
} = {}) {
  const n = Number.isFinite(Number(streak)) ? Math.max(0, Math.floor(Number(streak))) : 0
  const min = Number.isFinite(Number(threshold)) && Number(threshold) > 0 ? Math.floor(Number(threshold)) : 1
  if (kind === 'reachable') return { verdict: 'reachable', streak: n, reason: '' }
  if (kind === 'transport') {
    // WHICH host blipped is the whole information content of this alert, so it is
    // said rather than summarised: the reader has to be able to tell "our checker
    // could not reach raw" from "the page the phone opens is down".
    //
    // AND THE CLOSING SENTENCE IS NOT THE SAME ON BOTH SIDES (four-eyes review of
    // this point). Only the CURRENCY host carries the fingerprint, so when IT is
    // the one that failed, this tick did not read the board's currency at all —
    // saying "the currency is known and unaffected" there would be an alert
    // asserting something untrue, which is the exact sin point 562 was opened on.
    // Both branches are still "not a stale board", because a stale board is a
    // claim about CONTENT and nothing here observed any; what differs is whether
    // the currency was READ this tick or is simply unknown until the next probe.
    const currencyAnswered = isOk(currency)
    const failed = currencyAnswered ? 'the board VIEWER' : 'the CURRENCY transport'
    const answered = currencyAnswered ? 'the currency check' : 'the viewer host'
    const why = currencyAnswered ? viewer?.error : currency?.error
    const closing = currencyAnswered
      ? 'This is a transport failure, NOT a stale board — the currency check DID read the board this tick, ' +
        'and what it read is unaffected.'
      : 'This is a transport failure, NOT a stale board — the board is demonstrably reachable. But its ' +
        'CURRENCY IS UNKNOWN this tick: only the currency host carries the fingerprint, and that is the one ' +
        'that did not answer. The next probe decides it.'
    return {
      verdict: 'transport',
      streak: n,
      reason: `${failed} could not be fetched (${why || 'fetch failed'}), while ${answered} answered normally. ${closing}`,
    }
  }
  if (n < min) {
    return {
      verdict: 'flaky',
      streak: n,
      reason:
        `neither transport answered (${currency?.error || 'fetch failed'} / ${viewer?.error || 'fetch failed'}), ` +
        `but this is failure ${n} of the ${min} consecutive ones a report needs — a single flicker is not an outage`,
    }
  }
  return {
    verdict: 'unreachable',
    streak: n,
    reason:
      `neither the currency transport (${currency?.error || 'fetch failed'}) nor the viewer ` +
      `(${viewer?.error || 'fetch failed'}) answered, for ${n} consecutive probes`,
  }
}

/** One line for the launcher log — the caller prints it whatever the verdict. */
export function describeProbe(v) {
  return `board probe: ${v?.verdict ?? 'unknown'}${v?.streak ? ` (streak ${v.streak})` : ''}${v?.reason ? ` — ${v.reason}` : ''}`
}
