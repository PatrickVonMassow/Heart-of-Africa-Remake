// In-game invariant assertions (point 207(i)) — the finder's force multiplier:
// a broken rule reports ITSELF the moment it happens, ANYWHERE — in every
// headless suite (whose console-error gates already fail on console.error) and
// in every manual play session (visible in the devtools console) — instead of
// only where a test happens to look. DEV-mode only; compiled out of prod by the
// import.meta.env.DEV guard. Rate-limited per code so a persistent violation
// cannot flood the console or the log.

interface AssertEntry {
  code: string
  detail: string
  t: number
}

const lastFired = new Map<string, number>()
const RATE_MS = 5000

/** Assert a structural invariant. On failure (dev only): one console.error per
 *  code per 5 s — every verify suite fails on it — plus an entry in
 *  window.__assertLog for probes. `detail` is lazy so the happy path costs
 *  nothing. */
export function devAssert(cond: boolean, code: string, detail?: () => string): void {
  if (cond || !import.meta.env.DEV) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const last = lastFired.get(code) ?? -Infinity
  if (now - last < RATE_MS) return
  lastFired.set(code, now)
  const d = detail ? detail() : ''
  console.error(`[ASSERT] ${code}${d ? ' — ' + d : ''}`)
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __assertLog?: AssertEntry[] }
    ;(w.__assertLog ??= []).push({ code, detail: d, t: now })
    if (w.__assertLog.length > 200) w.__assertLog.splice(0, w.__assertLog.length - 200)
  }
}

/** Test hook: clear the rate-limit memory (deterministic unit tests). */
export function resetDevAsserts(): void {
  lastFired.clear()
  if (typeof window !== 'undefined') delete (window as unknown as { __longRun?: unknown }).__longRun
}

// --- The LONG-RUN rule family (work-order point 589) -------------------------
//
// The defect this exists for: the adults spoke for a few minutes and then fell
// permanently silent. Every suite was green, because no suite runs for minutes —
// they simulate seconds, and a producer that stops LATER is out of their reach
// entirely. The picture cannot show it either: a silent village looks exactly
// like a village between two utterances.
//
// So the running game measures it. A system that must KEEP PRODUCING carries a
// watch, and the watch raises the ordinary assert channel's `console.error` once
// it has been silent longer than its own specified maximum. Every session then
// becomes the detector — every headless suite (whose console-error gate fails on
// it), every manual play session, every hour someone leaves the game standing.
//
// The rule that keeps it honest: a producer that is LEGITIMATELY quiet — nobody
// to speak to, nothing to speak about, a group idling by design — is not judged
// at all. An alarm that cries on a healthy quiet spell is turned off within a
// week, and then it is worth nothing when the real one comes.

/**
 * Where a step stops being a FRAME and becomes the frame loop standing still — a
 * hidden tab, a breakpoint, a machine swapped out under a run. Up to it a step
 * counts in FULL, so a window of 60 s means sixty ELAPSED seconds at any frame
 * rate a running game has; a longer gap counts this much and no more, so one
 * suspension cannot flood the clock (5 s against the shortest window, 60 s)
 * while a loop that really is crawling at six-second frames still accrues and is
 * still reported, a little later.
 *
 * Both simpler rules are wrong, and both were tried: clamping EVERY step to a
 * second turned a 60 s window into 120 s at two-second frames, and discarding a
 * long step entirely let a producer stalled at six-second frames stay silent for
 * ever without a word.
 */
export const LONG_RUN_SUSPEND_SECONDS = 5

/** One long-run producer's memory. Plain data, owned by the system that
 *  produces, so a pure step function can carry it and a test can drive it. */
export interface ProducerWatch {
  /** Seconds it has produced nothing while it was expected to. */
  silence: number
  /** Outputs seen so far — a probe for the tests and the dev hooks. */
  produced: number
}

export function createProducerWatch(): ProducerWatch {
  return { silence: 0, produced: 0 }
}

/** What one step tells the watch about its producer. */
export interface ProducerStep {
  /** Stable assert code, e.g. `errands-silent`. */
  code: string
  /** Seconds this step advanced the world by. */
  dt: number
  /** The producer emitted something this step. */
  produced: boolean
  /** Whether it is SUPPOSED to be producing right now. `false` is a legitimate
   *  quiet spell and is never judged. */
  expected: boolean
  /** The longest silence tolerated while it is expected to produce, in seconds. */
  maxSilenceSeconds: number
  /** Appended to the alarm — the state that explains the silence. */
  detail?: () => string
}

/** Dev-only snapshot of every watched producer, for a manual session and for a
 *  headless probe: who is quiet, for how long, and against which window. */
function record(code: string, watch: ProducerWatch, max: number, expected: boolean): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return
  const w = window as unknown as {
    __longRun?: Record<string, { code: string; silence: number; max: number; produced: number; expected: boolean }>
  }
  ;(w.__longRun ??= {})[code] = { code, silence: watch.silence, max, produced: watch.produced, expected }
}

/**
 * Advances one producer's watch by a step and judges it. Call it ONCE per step,
 * with what the step actually produced — the alarm is about the OUTPUT that
 * reaches the player (an utterance spoken, a round played), never about the
 * timer that was supposed to schedule it.
 *
 * A step that produced, and a step in which nothing was expected, both put the
 * clock back to zero: a producer coming out of a legitimate quiet spell gets its
 * full window before anything is claimed about it.
 */
export function watchProducer(watch: ProducerWatch, step: ProducerStep): void {
  const dt =
    Number.isFinite(step.dt) && step.dt > 0 ? Math.min(step.dt, LONG_RUN_SUSPEND_SECONDS) : 0
  if (step.produced) {
    watch.produced++
    watch.silence = 0
  } else if (!step.expected) {
    watch.silence = 0
  } else {
    watch.silence += dt
  }
  const max = Math.max(1, step.maxSilenceSeconds)
  record(step.code, watch, max, step.expected)
  devAssert(watch.silence <= max, step.code, () => {
    const extra = step.detail ? ` — ${step.detail()}` : ''
    return `nothing produced for ${watch.silence.toFixed(0)}s of ${max}s${extra}`
  })
}
