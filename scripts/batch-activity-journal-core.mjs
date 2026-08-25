/**
 * The batch activity journal's stable vocabulary and record validation.
 *
 * This module is deliberately pure.  The append protocol lives beside it in
 * batch-activity-journal.mjs; the classifier imports only this file so reports
 * never acquire a batch lock or mutate runtime state.
 */

export const ACTIVITY_JOURNAL_VERSION = 1

export const ACTIVITY_EVENTS = Object.freeze({
  OWNER_CLAIM: 'owner-claim',
  FOREGROUND_ACTIVITY: 'foreground-activity',
  DELEGATED_START: 'delegated-start',
  DELEGATED_FINISH: 'delegated-finish',
  VERIFICATION_START: 'verification-start',
  VERIFICATION_PROGRESS: 'verification-progress',
  VERIFICATION_FINISH: 'verification-finish',
  CI_WAIT_START: 'ci-wait-start',
  CI_WAIT_OBSERVATION: 'ci-wait-observation',
  CI_WAIT_FINISH: 'ci-wait-finish',
  HANDOVER: 'handover',
  PROCESS_EXIT: 'process-exit',
  WRITER_VETO: 'writer-veto',
  PAUSE: 'pause',
  PAUSE_FINISH: 'pause-finish',
  SPAWN_ATTEMPT: 'spawn-attempt',
  SPAWN_FAILURE: 'spawn-failure',
  SUCCESSOR_START: 'successor-start',
})

export const ACTIVITY_EVENT_SET = new Set(Object.values(ACTIVITY_EVENTS))

const finiteOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Return one complete journal record. Missing identity is explicit null, never
 * omitted: a report can distinguish absent evidence from a legacy line. */
export function activityRecord({
  seq,
  at = Date.now(),
  event,
  session = null,
  point = null,
  pid = null,
  pidStartedAt = null,
  generation = null,
  cause = 'unspecified',
  evidence = {},
} = {}) {
  const atMs = finiteOrNull(at)
  if (!Number.isSafeInteger(seq) || seq <= 0) throw new TypeError('journal seq must be a positive safe integer')
  if (atMs === null) throw new TypeError('journal at must be a finite epoch millisecond')
  if (!ACTIVITY_EVENT_SET.has(event)) throw new TypeError(`unknown batch activity event: ${String(event)}`)
  if (typeof cause !== 'string' || cause.trim() === '') throw new TypeError('journal cause must be a non-empty code')
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError('journal evidence must be an object')
  }
  return {
    v: ACTIVITY_JOURNAL_VERSION,
    seq,
    at: new Date(atMs).toISOString(),
    atMs,
    event,
    session: typeof session === 'string' && session ? session : null,
    point: Number.isInteger(point) && point > 0 ? point : null,
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    pidStartedAt: finiteOrNull(pidStartedAt),
    generation: Number.isSafeInteger(generation) && generation >= 0 ? generation : null,
    cause,
    evidence: { ...evidence },
  }
}

/** Strict enough to keep corrupt/partial lines out of classification. */
export function validActivityRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.v !== ACTIVITY_JOURNAL_VERSION) return false
  if (!Number.isSafeInteger(value.seq) || value.seq <= 0) return false
  if (typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) return false
  if (typeof value.atMs !== 'number' || !Number.isFinite(value.atMs)) return false
  if (new Date(value.atMs).toISOString() !== value.at) return false
  if (!ACTIVITY_EVENT_SET.has(value.event)) return false
  if (typeof value.cause !== 'string' || value.cause === '') return false
  return !!value.evidence && typeof value.evidence === 'object' && !Array.isArray(value.evidence)
}

/** Parse JSONL without turning a torn final write into invented evidence. */
export function parseActivityJournal(text = '') {
  const records = []
  const rejected = []
  for (const [index, line] of String(text).split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      if (validActivityRecord(record)) records.push(record)
      else rejected.push({ line: index + 1, reason: 'invalid-record' })
    } catch {
      rejected.push({ line: index + 1, reason: 'invalid-json' })
    }
  }
  records.sort((a, b) => a.seq - b.seq)
  return { records, rejected }
}

