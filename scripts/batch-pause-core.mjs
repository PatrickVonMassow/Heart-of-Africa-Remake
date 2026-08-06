// EVERY PARK CARRIES A RESTART CLOCK (point 445, out of the fortnight-alone review).
//
// `.claude/batch-paused` used to be a plain marker: it stopped the batch until a
// human deleted the file. Unattended that turns a cause which would have cleared
// itself in twenty minutes — a red CI run, a guard loop, an environment outage —
// into the rest of the absence. So a park now RECORDS why it happened and WHEN it
// may be retried, and the launcher tick (scripts/batch-autostart.mjs) resumes the
// batch when that clock runs out, noting the attempt.
//
// THE RECORD IS TEXT, AND A LEGACY MARKER IS STILL A PARK. The file is written and
// read by hand as often as by a script, so the format is the reason on its own
// line(s) followed by `key: value` metadata:
//
//     autostart watchdog: 3 resurrections made no progress
//     cause: runaway
//     paused-at: 2026-08-06T09:00:00.000Z
//     retry-after: 2026-08-06T09:20:00.000Z
//     attempt: 1
//
// A file WITHOUT a `retry-after` — every marker an older session wrote, and every
// one a human writes with `echo` — carries no clock and therefore parks until
// somebody clears it ('hold'). That direction is the safe one: a missing clock may
// never be read as an expired one, or a genuinely unsafe state would resume itself.
//
// PARKING WITHOUT A CLOCK IS A SHORT, WRITTEN-DOWN LIST (`CLOCKLESS_CAUSES`).
// Everything else gets the ladder. Where a retry is safe at all, the batch should
// not park in the first place — a forbidden serving model lets the fallback chain
// of CLAUDE.md §6 run rather than stopping.
//
// Pure: no fs, no clock of its own, no process state. The fs side lives in
// scripts/batch-lock.mjs, the tick's decision in scripts/batch-autostart.mjs.

/** The metadata keys the record understands. Anything else is part of the reason,
 *  so a legacy line like `autostart watchdog: …` is never eaten as metadata. */
export const PAUSE_KEYS = ['cause', 'paused-at', 'retry-after', 'attempt']

/** The literal that says "this park has no clock ON PURPOSE" — distinct from a
 *  record that simply predates the mechanism, though both park the same way. */
export const NEVER = 'never'

/**
 * THE CAUSES THAT PARK WITHOUT A CLOCK. Short by design, and each one is a state
 * where an unattended retry would repeat the very thing that stopped the batch.
 */
export const CLOCKLESS_CAUSES = {
  'serving-model':
    'a serving model outside the CLAUDE.md §6 allowlist — retrying only spawns the same degraded session; ' +
    'the fallback chain is the answer where one is available at all',
  'user-stop': 'the user asked for the batch to stop — only the user restarts it',
  'awaiting-user': 'every open point waits on a user decision — a retry would find the same queue',
  'retries-exhausted': 'the clock already ran out its ladder and the cause is still there — a human is needed',
}

/**
 * The retry ladder: a first park is short, each further one longer, and after the
 * last rung the park becomes clockless ('retries-exhausted'). Twenty minutes is the
 * point's own measure of a self-clearing cause; three hours is long enough that a
 * genuinely broken batch is not spawning all night.
 *
 * THE RUNG IS COUNTED PER SPELL, NOT PER CAUSE AND NOT FOR EVER. `attempt` is how
 * many times the launcher has resumed the batch SINCE IT LAST MADE PROGRESS — the
 * counter is cleared with `failCount` the moment a spawn commits something. Two
 * findings of the four-eyes review meet here: a counter that never resets would
 * make every park clockless for ever after three retries in the machine's whole
 * history, and a counter only the launcher's own parks carried would leave an
 * unanswered alert or a standing outage oscillating at rung 1 all night.
 */
export const PAUSE_RETRY_LADDER_MS = [20 * 60 * 1000, 60 * 60 * 1000, 3 * 60 * 60 * 1000]

export function isClocklessCause(cause) {
  return typeof cause === 'string' && Object.prototype.hasOwnProperty.call(CLOCKLESS_CAUSES, cause)
}

const isoOrNull = (v) => {
  if (!Number.isFinite(v)) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * A full ISO stamp — date AND time. `Date.parse` alone would read the TRUNCATED
 * stamp of a torn write ("retry-after: 2026") as 1 January of that year, which is
 * in the past, which resumes the batch: the one corruption mode that can flip this
 * mechanism toward the unsafe direction (four-eyes review, Fable 5, finding 4).
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/

/** No epoch stamp this mechanism writes can predate the mechanism. */
const EPOCH_FLOOR_MS = Date.UTC(2020, 0, 1)

/** Accepts a full ISO stamp or epoch milliseconds; anything else is null (no clock). */
export function parseInstant(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).trim()
  if (text === '') return null
  if (/^\d+$/.test(text)) {
    const ms = Number(text)
    // A FLOOR, for the same reason: "2026" is also all digits, and as epoch
    // milliseconds it is 1970 — a stamp in the past, which would resume the batch.
    return Number.isFinite(ms) && ms >= EPOCH_FLOOR_MS ? ms : null
  }
  if (!ISO_INSTANT.test(text)) return null
  const ms = Date.parse(text)
  return Number.isNaN(ms) ? null : ms
}

/**
 * The record as TEXT. `retryAfter` is epoch ms, or null for a clockless park (the
 * file then says `retry-after: never`, so a reader sees a decision rather than an
 * omission).
 */
export function formatPauseRecord({ reason, cause = null, retryAfter = null, pausedAt = null, attempt = 0 } = {}) {
  const body = String(reason ?? '').trim() || 'paused (no reason recorded)'
  const lines = [body]
  if (cause) lines.push(`cause: ${cause}`)
  const paused = isoOrNull(pausedAt)
  if (paused) lines.push(`paused-at: ${paused}`)
  lines.push(`retry-after: ${isoOrNull(retryAfter) ?? NEVER}`)
  if (attempt > 0) lines.push(`attempt: ${attempt}`)
  return `${lines.join('\n')}\n`
}

/**
 * Split a record into its reason and its metadata. A line only counts as metadata
 * when its key is one of PAUSE_KEYS — that is what keeps a legacy reason intact.
 */
export function parsePauseRecord(text) {
  const meta = {}
  const reasonLines = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z-]+)\s*:\s*(.*)$/.exec(raw)
    if (m && PAUSE_KEYS.includes(m[1].toLowerCase())) meta[m[1].toLowerCase()] = m[2].trim()
    else reasonLines.push(raw)
  }
  const retryRaw = meta['retry-after'] ?? null
  const clockless = retryRaw != null && retryRaw.toLowerCase() === NEVER
  const attempt = Number.parseInt(meta.attempt ?? '', 10)
  return {
    reason: reasonLines.join('\n').trim(),
    cause: meta.cause || null,
    pausedAt: parseInstant(meta['paused-at'] ?? null),
    retryAfter: clockless ? null : parseInstant(retryRaw),
    // Told apart so the log can say "parked on purpose" rather than "no clock found".
    clocklessOnPurpose: clockless,
    hasRetryKey: retryRaw != null,
    attempt: Number.isFinite(attempt) && attempt > 0 ? attempt : 0,
  }
}

/**
 * What the launcher should do with the record it found.
 *
 *   text === null  → 'none'   the file does not exist; the batch is not parked
 *   no usable clock→ 'hold'   legacy marker, `never`, or an unreadable stamp
 *   clock ahead    → 'wait'   still parked, `waitMs` to go
 *   clock passed   → 'retry'  the launcher clears the record and resumes
 *
 * An EMPTY file is a park ('hold'): `touch .claude/batch-paused` is how a session
 * is told to stop, and an empty record must not read as "not paused".
 */
export function classifyPause({ text, now = Date.now() } = {}) {
  if (text == null) return { state: 'none', reason: '', cause: null, retryAfter: null, attempt: 0, waitMs: 0, why: 'no pause record' }
  const rec = parsePauseRecord(text)
  const base = { reason: rec.reason, cause: rec.cause, retryAfter: rec.retryAfter, attempt: rec.attempt, pausedAt: rec.pausedAt, waitMs: 0 }
  if (rec.retryAfter == null) {
    const why = rec.clocklessOnPurpose
      ? `parked without a clock on purpose${rec.cause ? ` (${rec.cause})` : ''}`
      : rec.hasRetryKey
        ? 'the retry-after stamp is unreadable — treated as clockless'
        : 'no retry-after recorded (a legacy or hand-written marker)'
    return { ...base, state: 'hold', why }
  }
  if (rec.retryAfter > now) {
    return { ...base, state: 'wait', waitMs: rec.retryAfter - now, why: `retry due in ${Math.round((rec.retryAfter - now) / 60000)} min` }
  }
  return { ...base, state: 'retry', why: `the retry clock ran out ${Math.round((now - rec.retryAfter) / 60000)} min ago` }
}

/**
 * The clock a NEW park gets: `attempt` is how many retries this cause has already
 * had (0 for the first park). Returns the record fields to write. A cause on the
 * clockless list, and a cause that has climbed off the end of the ladder, park
 * without one.
 */
export function planPause({ cause = null, attempt = 0, now = Date.now(), ladder = PAUSE_RETRY_LADDER_MS } = {}) {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0
  if (isClocklessCause(cause)) {
    return { cause, attempt: n, retryAfter: null, clockless: true, why: CLOCKLESS_CAUSES[cause] }
  }
  const delay = ladder[n]
  if (!Number.isFinite(delay)) {
    return {
      cause: cause ?? 'retries-exhausted',
      attempt: n,
      retryAfter: null,
      clockless: true,
      why: CLOCKLESS_CAUSES['retries-exhausted'],
    }
  }
  return { cause, attempt: n, retryAfter: now + delay, clockless: false, why: `retry in ${Math.round(delay / 60000)} min (rung ${n + 1} of ${ladder.length})` }
}

/** One line for .claude/autostart.log — the tick's own record of what it read. */
export function describePause(verdict) {
  const v = verdict ?? {}
  const reason = v.reason ? ` — ${String(v.reason).split('\n')[0]}` : ''
  switch (v.state) {
    case 'hold':
      return `skip: batch is paused with no restart clock (${v.why})${reason}`
    case 'wait':
      return `skip: batch is paused, ${Math.max(1, Math.round((v.waitMs ?? 0) / 60000))} min left on the restart clock${reason}`
    case 'retry':
      return `PAUSE CLOCK EXPIRED — resuming the batch (${v.why}, attempt ${(v.attempt ?? 0) + 1})${reason}`
    default:
      return 'not paused'
  }
}
