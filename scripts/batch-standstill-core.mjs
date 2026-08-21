import { ACTIVITY_EVENTS } from './batch-activity-journal-core.mjs'

export const STANDSTILL_THRESHOLD_MS = 20 * 60 * 1000
export const STANDSTILL_THRESHOLD_REASON =
  '20 minutes preserves the measured four-day baseline and sits five minutes beyond one normal 15-minute launcher tick; a smaller threshold would report ordinary scheduler jitter as a stall.'

export const ACTIVITY_CLASSES = Object.freeze({
  FOREGROUND: 'foreground-work',
  DELEGATED: 'delegated-work',
  VERIFICATION: 'verification',
  CI_WAIT: 'ci-wait',
  HANDOVER: 'handover-transition',
  BLOCKED_USER: 'blocked-by-user',
  BLOCKED_QUOTA: 'blocked-by-quota',
  BLOCKED_ENVIRONMENT: 'blocked-by-environment',
  BLOCKED_WRITER_VETO: 'blocked-by-writer-veto',
  NO_WORKER: 'standstill-no-worker',
  IDLE_OWNER: 'standstill-idle-owner',
  UNKNOWN: 'unknown',
})

export const ACTIVITY_CLASS_SET = new Set(Object.values(ACTIVITY_CLASSES))

/**
 * Evidence precedence, highest first. A deliberate external block wins; named
 * advancing work then wins over waits; measured infrastructure blocks win over
 * transition/idle fallbacks. Owner presence and launcher skips are state facts,
 * not work, and are applied only after every positive interval is exhausted.
 */
export const CLASS_PRECEDENCE = Object.freeze([
  ACTIVITY_CLASSES.BLOCKED_USER,
  ACTIVITY_CLASSES.BLOCKED_QUOTA,
  ACTIVITY_CLASSES.BLOCKED_ENVIRONMENT,
  ACTIVITY_CLASSES.VERIFICATION,
  ACTIVITY_CLASSES.DELEGATED,
  ACTIVITY_CLASSES.FOREGROUND,
  ACTIVITY_CLASSES.CI_WAIT,
  ACTIVITY_CLASSES.BLOCKED_WRITER_VETO,
  ACTIVITY_CLASSES.HANDOVER,
  ACTIVITY_CLASSES.IDLE_OWNER,
  ACTIVITY_CLASSES.NO_WORKER,
  ACTIVITY_CLASSES.UNKNOWN,
])

const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))

export function evidenceInterval({ start, end, className, cause = 'unspecified', evidence = {}, source = 'journal', state = null } = {}) {
  if (!finite(start) || !finite(end) || end <= start) return null
  if (className !== null && !ACTIVITY_CLASS_SET.has(className)) throw new TypeError(`unknown activity class: ${className}`)
  return { start, end, className, cause, evidence: { ...evidence }, source, state }
}

function covering(intervals, start, end) {
  return intervals.filter((item) => item.start <= start && item.end >= end)
}

function selectedEvidence(active) {
  if (active.some((item) => item.state === 'contradiction')) {
    return { className: ACTIVITY_CLASSES.UNKNOWN, cause: 'contradictory-evidence', evidence: active.map((x) => x.evidence) }
  }
  const owners = active.filter((item) => item.state === 'owner')
  const ownerIdentities = new Set(owners.map((item) => `${item.evidence.session ?? ''}|${item.evidence.pid ?? ''}|${item.evidence.pidStartedAt ?? ''}|${item.evidence.generation ?? ''}`))
  if (ownerIdentities.size > 1) {
    return { className: ACTIVITY_CLASSES.UNKNOWN, cause: 'contradictory-owners', evidence: owners.map((x) => x.evidence) }
  }
  for (const className of CLASS_PRECEDENCE) {
    if (className === ACTIVITY_CLASSES.IDLE_OWNER || className === ACTIVITY_CLASSES.NO_WORKER || className === ACTIVITY_CLASSES.UNKNOWN) continue
    const match = active.find((item) => item.className === className)
    if (match) return match
  }
  if (owners.length > 0) {
    return {
      className: ACTIVITY_CLASSES.IDLE_OWNER,
      cause: 'owner-without-work-evidence',
      evidence: owners[0].evidence,
      source: owners[0].source,
    }
  }
  const noWorker = active.find((item) => item.state === 'no-worker' || item.className === ACTIVITY_CLASSES.NO_WORKER)
  if (noWorker) return { ...noWorker, className: ACTIVITY_CLASSES.NO_WORKER }
  return { className: ACTIVITY_CLASSES.UNKNOWN, cause: 'missing-evidence', evidence: {} }
}

/** Split at every evidence/event boundary and account for each millisecond once. */
export function classifyTimeline({ start, end, intervals = [], boundaries = [], journalStartedAt = null } = {}) {
  if (!finite(start) || !finite(end) || end <= start) throw new TypeError('classification window must have start < end')
  const usable = intervals
    .filter(Boolean)
    .map((item) => ({ ...item, start: clamp(item.start, start, end), end: clamp(item.end, start, end) }))
    .filter((item) => item.end > item.start)
  const cuts = new Set([start, end])
  for (const item of usable) { cuts.add(item.start); cuts.add(item.end) }
  for (const point of boundaries) if (finite(point) && point > start && point < end) cuts.add(point)
  if (finite(journalStartedAt) && journalStartedAt > start && journalStartedAt < end) cuts.add(journalStartedAt)
  const ordered = [...cuts].sort((a, b) => a - b)
  const result = []
  for (let index = 1; index < ordered.length; index += 1) {
    const segmentStart = ordered[index - 1]
    const segmentEnd = ordered[index]
    let chosen
    // Evidence predating the journal cannot be promoted into work. The one
    // exception is evidence explicitly sourced from a historical fixture: that
    // is how the measured incident remains reproducible without pretending the
    // live journal existed then.
    if (finite(journalStartedAt) && segmentStart < journalStartedAt) {
      const historical = covering(usable, segmentStart, segmentEnd).filter((item) => item.source === 'historical-fixture')
      chosen = historical.length > 0 ? selectedEvidence(historical) : {
        className: ACTIVITY_CLASSES.UNKNOWN,
        cause: 'predates-journal',
        evidence: { journalStartedAt },
      }
    } else {
      chosen = selectedEvidence(covering(usable, segmentStart, segmentEnd))
    }
    result.push({
      start: segmentStart,
      end: segmentEnd,
      durationMs: segmentEnd - segmentStart,
      className: chosen.className,
      cause: chosen.cause,
      evidence: chosen.evidence ?? {},
      source: chosen.source ?? null,
    })
  }
  return result
}

function boundedEnd(record, fallbackEnd) {
  const candidates = [record?.evidence?.finishedAt, record?.evidence?.leaseUntil].filter(finite)
  return candidates.length > 0 ? Math.min(...candidates) : fallbackEnd
}

function identityMatches(a, b) {
  if (a?.session && b?.session && a.session !== b.session) return false
  if (finite(a?.pid) && finite(b?.pid) && a.pid !== b.pid) return false
  if (finite(a?.pidStartedAt) && finite(b?.pidStartedAt) && Math.abs(a.pidStartedAt - b.pidStartedAt) > 2000) return false
  if (finite(a?.generation) && finite(b?.generation) && a.generation !== b.generation) return false
  return true
}

const eventId = (record) => String(record?.evidence?.id ?? record?.evidence?.runId ?? record?.evidence?.command ?? '')

function pairedIntervals(records, { starts, progresses = [], finishes, className, defaultCause, matchIdentity = true }) {
  const out = []
  for (const record of records.filter((item) => starts.includes(item.event))) {
    const id = eventId(record)
    const related = records.filter((item) =>
      item.seq > record.seq && eventId(item) === id && (!matchIdentity || identityMatches(record, item)),
    )
    const finish = related.find((item) => finishes.includes(item.event))
    const renewable = [record, ...related.filter((item) => progresses.includes(item.event))]
      .map((item) => item.evidence?.leaseUntil)
      .filter(finite)
    const leaseEnd = renewable.length > 0 ? Math.max(...renewable) : null
    const explicitEnd = finite(finish?.atMs) ? finish.atMs : null
    // A lease bounds an OPEN run. Once an explicit terminal record exists it
    // proves the real interval retrospectively, even if the last renewable lease
    // elapsed before the process managed to write its completion receipt.
    const end = explicitEnd ?? leaseEnd
    if (!finite(end) || end <= record.atMs) continue
    out.push(evidenceInterval({
      start: finite(record.evidence?.startedAt) ? record.evidence.startedAt : record.atMs,
      end,
      className,
      cause: record.cause || defaultCause,
      evidence: { ...record.evidence, terminal: finish?.evidence ?? null, session: record.session },
    }))
  }
  return out
}

/** Convert durable transitions to bounded evidence intervals. */
export function journalIntervals(records = [], { start, end } = {}) {
  const ordered = [...records].sort((a, b) => a.seq - b.seq)
  const intervals = []
  const boundaries = ordered.map((record) => record.atMs).filter(finite)
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].seq <= ordered[index - 1].seq || ordered[index].atMs < ordered[index - 1].atMs) {
      intervals.push(evidenceInterval({
        start: Math.max(start, ordered[index].atMs), end, className: null, state: 'contradiction',
        cause: 'journal-order', evidence: { previousSeq: ordered[index - 1].seq, seq: ordered[index].seq },
      }))
      break
    }
  }

  for (const claim of ordered.filter((record) => record.event === ACTIVITY_EVENTS.OWNER_CLAIM)) {
    const terminator = ordered.find((record) => record.seq > claim.seq && (
      record.event === ACTIVITY_EVENTS.OWNER_CLAIM ||
      ((record.event === ACTIVITY_EVENTS.HANDOVER || record.event === ACTIVITY_EVENTS.PROCESS_EXIT) && identityMatches(claim, record))
    ))
    const leaseEnd = claim.evidence?.leaseUntil
    const ownerEnd = Math.min(...[leaseEnd, terminator?.atMs, end].filter(finite))
    intervals.push(evidenceInterval({
      start: claim.atMs, end: ownerEnd, className: null, state: 'owner', cause: claim.cause,
      evidence: {
        session: claim.session, point: claim.point, pid: claim.pid, pidStartedAt: claim.pidStartedAt,
        generation: claim.generation, leaseUntil: finite(leaseEnd) ? leaseEnd : null,
      },
    }))
  }

  for (const record of ordered) {
    if (record.event === ACTIVITY_EVENTS.FOREGROUND_ACTIVITY) {
      intervals.push(evidenceInterval({
        start: finite(record.evidence?.startedAt) ? record.evidence.startedAt : record.atMs,
        end: boundedEnd(record, record.atMs),
        className: ACTIVITY_CLASSES.FOREGROUND,
        cause: record.cause,
        evidence: { ...record.evidence, session: record.session },
      }))
    }
    if (record.event === ACTIVITY_EVENTS.WRITER_VETO) {
      intervals.push(evidenceInterval({
        start: finite(record.evidence?.blockedFrom) ? record.evidence.blockedFrom : record.atMs,
        end: record.evidence?.blockedUntil,
        className: ACTIVITY_CLASSES.BLOCKED_WRITER_VETO,
        cause: record.cause,
        evidence: { ...record.evidence, writerSession: record.session, pid: record.pid, pidStartedAt: record.pidStartedAt, generation: record.generation },
      }))
    }
    if (record.event === ACTIVITY_EVENTS.SPAWN_FAILURE) {
      const className = record.cause.includes('quota') ? ACTIVITY_CLASSES.BLOCKED_QUOTA : ACTIVITY_CLASSES.BLOCKED_ENVIRONMENT
      intervals.push(evidenceInterval({
        start: record.atMs, end: record.evidence?.retryAt, className, cause: record.cause, evidence: record.evidence,
      }))
    }
  }

  intervals.push(...pairedIntervals(ordered, {
    starts: [ACTIVITY_EVENTS.DELEGATED_START], finishes: [ACTIVITY_EVENTS.DELEGATED_FINISH],
    className: ACTIVITY_CLASSES.DELEGATED, defaultCause: 'delegated-agent',
  }))
  intervals.push(...pairedIntervals(ordered, {
    starts: [ACTIVITY_EVENTS.VERIFICATION_START], progresses: [ACTIVITY_EVENTS.VERIFICATION_PROGRESS],
    finishes: [ACTIVITY_EVENTS.VERIFICATION_FINISH], className: ACTIVITY_CLASSES.VERIFICATION, defaultCause: 'verification-run',
  }))
  intervals.push(...pairedIntervals(ordered, {
    starts: [ACTIVITY_EVENTS.CI_WAIT_START], progresses: [ACTIVITY_EVENTS.CI_WAIT_OBSERVATION],
    finishes: [ACTIVITY_EVENTS.CI_WAIT_FINISH], className: ACTIVITY_CLASSES.CI_WAIT, defaultCause: 'ci-run', matchIdentity: false,
  }))

  for (const record of ordered.filter((item) => item.event === ACTIVITY_EVENTS.HANDOVER)) {
    const successor = ordered.find((item) => item.seq > record.seq && (
      item.event === ACTIVITY_EVENTS.SUCCESSOR_START || item.event === ACTIVITY_EVENTS.OWNER_CLAIM
    ))
    const transitionEnd = successor?.atMs ?? record.evidence?.leaseUntil ?? end
    intervals.push(evidenceInterval({
      start: record.atMs, end: transitionEnd, className: ACTIVITY_CLASSES.HANDOVER,
      cause: record.cause, evidence: { ...record.evidence, fromSession: record.session, successor: successor?.session ?? null },
    }))
  }

  for (const record of ordered.filter((item) => item.event === ACTIVITY_EVENTS.PAUSE)) {
    const finish = ordered.find((item) => item.seq > record.seq && item.event === ACTIVITY_EVENTS.PAUSE_FINISH)
    intervals.push(evidenceInterval({
      start: record.atMs, end: finish?.atMs ?? record.evidence?.until ?? end,
      className: ACTIVITY_CLASSES.BLOCKED_USER, cause: record.cause, evidence: record.evidence,
    }))
  }
  for (const record of ordered.filter((item) => item.event === ACTIVITY_EVENTS.PROCESS_EXIT)) {
    const successor = ordered.find((item) => item.seq > record.seq && (
      item.event === ACTIVITY_EVENTS.SUCCESSOR_START || item.event === ACTIVITY_EVENTS.OWNER_CLAIM
    ))
    intervals.push(evidenceInterval({
      start: record.atMs,
      end: successor?.atMs ?? end,
      className: null,
      state: 'no-worker',
      cause: 'process-identity-lost',
      evidence: { session: record.session, pid: record.pid, pidStartedAt: record.pidStartedAt, exitCause: record.cause },
    }))
  }
  return { intervals: intervals.filter(Boolean), boundaries }
}

export function timelineTotals(timeline = []) {
  const byClass = Object.fromEntries(Object.values(ACTIVITY_CLASSES).map((name) => [name, 0]))
  for (const item of timeline) byClass[item.className] += item.durationMs
  return { elapsedMs: timeline.reduce((sum, item) => sum + item.durationMs, 0), byClass }
}

export function commitGapSummary(commitTimes = [], thresholdMs = STANDSTILL_THRESHOLD_MS) {
  const times = [...new Set(commitTimes.filter(finite))].sort((a, b) => a - b)
  const gaps = []
  for (let index = 1; index < times.length; index += 1) {
    const durationMs = times[index] - times[index - 1]
    if (durationMs >= thresholdMs) gaps.push({ start: times[index - 1], end: times[index], durationMs })
  }
  return { commits: times.length, gaps, gapMs: gaps.reduce((sum, gap) => sum + gap.durationMs, 0) }
}
