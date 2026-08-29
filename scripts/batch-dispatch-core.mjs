// BOUNDED DISPATCH AND BACKPRESSURE — ordered-work step 5 in
// docs/handover-architecture.md. This core never invents work: every value a
// worker launch needs must already be present in the authorized queue entry.

import { DAEMON_POOL_CAP, SLOT_OCCUPYING_STATES } from './batch-daemon-core.mjs'

export const DEFAULT_QUEUE_LIMIT = 12
export const DEFAULT_REVIEW_BACKLOG_LIMIT = 2
export const DISPATCH_REASON_CODES = Object.freeze([
  'dependency-blocked',
  'review-backlog',
  'adapter-unavailable',
  'resource-headroom',
  'durability-failure',
])

const present = (value) => typeof value === 'string' && value.length > 0
const oid = (value) => typeof value === 'string' && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(value)

/** Validate the complete pre-authorization. Unknown fields are retained as
 * metadata, but none can substitute for a launch field checked here. */
export function authorizeQueue(entries, { limit = DEFAULT_QUEUE_LIMIT } = {}) {
  if (!Number.isInteger(limit) || limit < 1) return { ok: false, reason: 'the queue limit is a positive integer' }
  if (!Array.isArray(entries)) return { ok: false, reason: 'the authorized queue is an array' }
  if (entries.length > limit) return { ok: false, reason: `the authorized queue has ${entries.length} entries; its bound is ${limit}` }
  const seenPoints = new Set()
  const seenAttempts = new Set()
  const queue = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, reason: `queue entry ${index} is not an object` }
    }
    for (const field of ['pointId', 'attemptId', 'branch', 'worktree', 'adapter']) {
      if (!present(entry[field])) return { ok: false, reason: `queue entry ${index} misses ${field}; dispatch never invents it` }
    }
    if (!oid(entry.baseSha)) return { ok: false, reason: `queue entry ${index} carries no full base SHA` }
    if (!entry.worktree.startsWith('/')) return { ok: false, reason: `queue entry ${index} worktree is not absolute` }
    if (!Array.isArray(entry.dependencies) || entry.dependencies.some((dependency) => !present(dependency))) {
      return { ok: false, reason: `queue entry ${index} dependencies are explicit point ids` }
    }
    if (new Set(entry.dependencies).size !== entry.dependencies.length) {
      return { ok: false, reason: `queue entry ${index} repeats a dependency` }
    }
    if (entry.dependencies.includes(entry.pointId)) return { ok: false, reason: `queue entry ${index} depends on itself` }
    if (seenPoints.has(entry.pointId)) return { ok: false, reason: `point ${entry.pointId} is authorized twice` }
    if (seenAttempts.has(entry.attemptId)) return { ok: false, reason: `attempt ${entry.attemptId} is authorized twice` }
    seenPoints.add(entry.pointId)
    seenAttempts.add(entry.attemptId)
    queue.push(Object.freeze({ ...entry, dependencies: Object.freeze([...entry.dependencies]) }))
  }
  return { ok: true, queue: Object.freeze(queue) }
}

const stateOf = (attempt) => attempt?.state?.state ?? attempt?.state
const pointOf = (attempt) => String(attempt?.pointId ?? '')

/** One refill decision from a coherent snapshot. Queue order is authority:
 * dependency checks may skip an entry, but dispatch never reorders the entries
 * it does select. A second coordinator reading the six same candidates still
 * sees the shared active set and receives at most the remaining global slots. */
export function dispatchDecision({
  queue = [],
  attempts = [],
  landedPoints = [],
  cap = DAEMON_POOL_CAP,
  reviewBacklogLimit = DEFAULT_REVIEW_BACKLOG_LIMIT,
  adapters = ['sol'],
  resources = { ok: true },
  durable = { ok: true },
} = {}) {
  const checked = authorizeQueue(queue)
  if (!checked.ok) return checked
  if (!Number.isInteger(cap) || cap < 1 || cap > DAEMON_POOL_CAP) {
    return { ok: false, reason: `the requested cap must be between 1 and the global cap ${DAEMON_POOL_CAP}` }
  }
  if (!Number.isInteger(reviewBacklogLimit) || reviewBacklogLimit < 0) {
    return { ok: false, reason: 'the review backlog limit is a non-negative integer' }
  }
  const active = attempts.filter((attempt) => SLOT_OCCUPYING_STATES.includes(stateOf(attempt)))
  if (active.length > DAEMON_POOL_CAP) {
    return { ok: false, reason: `the durable state already violates the global cap (${active.length}/${DAEMON_POOL_CAP})`, reasonCode: 'durability-failure' }
  }
  const occupiedPoints = new Set(attempts.filter((attempt) => !['landed', 'failed', 'cancelled'].includes(stateOf(attempt))).map(pointOf))
  const landed = new Set([...landedPoints.map(String), ...attempts.filter((attempt) => stateOf(attempt) === 'landed').map(pointOf)])
  const backlog = attempts.filter((attempt) => stateOf(attempt) === 'ready-for-review').length
  const dependencyReady = checked.queue.filter((entry) => entry.dependencies.every((dependency) => landed.has(String(dependency))))
  const candidates = dependencyReady.filter((entry) => !occupiedPoints.has(String(entry.pointId)))
  const availableAdapters = new Set(adapters)
  let reasonCode = null
  if (durable?.ok !== true) reasonCode = 'durability-failure'
  else if (resources?.ok !== true) reasonCode = 'resource-headroom'
  else if (backlog >= reviewBacklogLimit && candidates.length) reasonCode = 'review-backlog'
  const adapterReady = candidates.filter((entry) => availableAdapters.has(entry.adapter))
  if (!reasonCode && candidates.length && !adapterReady.length) reasonCode = 'adapter-unavailable'
  const slots = Math.max(0, cap - active.length)
  const selected = reasonCode ? [] : adapterReady.slice(0, slots)
  if (!reasonCode && !selected.length && checked.queue.length > dependencyReady.length) reasonCode = 'dependency-blocked'
  const projected = active.length + selected.length
  const eligibleBeforePressure = candidates.length
  const underutilized = projected < cap && eligibleBeforePressure >= cap - active.length && reasonCode !== null
  return {
    ok: true,
    selected,
    active: active.length,
    projected,
    cap,
    backlog,
    backlogLimit: reviewBacklogLimit,
    eligible: eligibleBeforePressure,
    reasonCode,
    underutilized,
  }
}

/** Journal projection for one reason interval. Repeated observations extend an
 * open interval without creating duplicates; a recovered pool closes it. */
export function updateReasonInterval({ open = null, decision, at } = {}) {
  if (!Number.isFinite(at)) return { ok: false, reason: 'reason accounting needs a finite observation time' }
  if (!decision?.underutilized) {
    return open ? { ok: true, closed: Object.freeze({ ...open, endedAt: at, durationMs: Math.max(0, at - open.startedAt) }), open: null } : { ok: true, open: null }
  }
  if (!DISPATCH_REASON_CODES.includes(decision.reasonCode)) return { ok: false, reason: `unknown dispatch reason: ${String(decision.reasonCode)}` }
  if (open?.reasonCode === decision.reasonCode) return { ok: true, open: Object.freeze({ ...open, observedAt: at }) }
  const closed = open ? Object.freeze({ ...open, endedAt: at, durationMs: Math.max(0, at - open.startedAt) }) : null
  return {
    ok: true,
    closed,
    open: Object.freeze({ reasonCode: decision.reasonCode, startedAt: at, observedAt: at, active: decision.active, eligible: decision.eligible }),
  }
}

/** Recover the one currently open dispatch reason from its append-only metric
 * events. A close only closes the interval it names; malformed or stale closes
 * cannot erase a newer open interval. */
export function openReasonIntervalFromEvents(events = []) {
  let open = null
  for (const event of events) {
    if (event?.kind !== 'dispatch-reason') continue
    if (event.phase === 'open' && Number.isFinite(event.startedAt) && DISPATCH_REASON_CODES.includes(event.reasonCode)) {
      open = Object.freeze({
        reasonCode: event.reasonCode,
        startedAt: event.startedAt,
        observedAt: event.observedAt ?? event.startedAt,
        active: event.active,
        eligible: event.eligible,
      })
    } else if (event.phase === 'closed' && open && event.startedAt === open.startedAt && event.reasonCode === open.reasonCode) {
      open = null
    }
  }
  return open
}

/** Build the append-only metrics for one completed dispatch observation. The
 * previous observation owns the elapsed interval up to `at`; the current one
 * becomes the durable starting point for the next dispatch. */
export function dispatchMetricEvents({ events = [], decision, at } = {}) {
  if (!decision?.ok || !Number.isFinite(at)) return { ok: false, reason: 'dispatch metrics need a successful decision and finite observation time' }
  const previous = [...events].reverse().find((event) => event?.kind === 'dispatch-observation') ?? null
  const open = openReasonIntervalFromEvents(events)
  const reason = updateReasonInterval({ open, decision, at })
  if (!reason.ok) return reason
  const recorded = []
  if (previous && Number.isFinite(previous.at) && at >= previous.at) {
    recorded.push(Object.freeze({
      kind: 'lane-utilization', at, startedAt: previous.at, endedAt: at,
      eligibleLanes: previous.eligibleLanes, runningLanes: previous.runningLanes,
      reasonCode: previous.reasonCode ?? null,
    }))
  }
  if (reason.closed) recorded.push(Object.freeze({ kind: 'dispatch-reason', phase: 'closed', at, ...reason.closed }))
  if (reason.open && (!open || reason.open.startedAt !== open.startedAt || reason.open.reasonCode !== open.reasonCode)) {
    recorded.push(Object.freeze({ kind: 'dispatch-reason', phase: 'open', at, ...reason.open }))
  }
  recorded.push(Object.freeze({
    kind: 'dispatch-observation', at,
    eligibleLanes: decision.eligible,
    runningLanes: decision.projected,
    reasonCode: decision.underutilized ? decision.reasonCode : null,
  }))
  return { ok: true, events: Object.freeze(recorded), open: reason.open }
}
