// MEASURED EXPIRY FOR AUTOMATIC DECISIONS (point 936).
//
// A decision is evidence, not a permanent warning. Its record names the
// measurement that can settle it; the board stops projecting the record only
// after a clean result newer than the decision. Both inputs remain in their
// durable stores, so expiry hides a settled card without deleting its history.

export const BATCH_DOCTOR_GATE_KEY = 'batch-doctor-gate'

export const BATCH_DOCTOR_GATE_MEASUREMENT = Object.freeze({
  key: BATCH_DOCTOR_GATE_KEY,
  label: 'node scripts/batch-doctor.mjs --gate',
  cleanWhen: 'the doctor reports the repository state consistent and every fast gate is green',
  evidence: '.claude/doctor.log',
})

const trim = (value) => String(value ?? '').trim()
const finitePositive = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

/** The parallel-session decision is settled by the doctor run it already asks
 * the owner to perform. Other alert classes must opt into their own measurement
 * rather than inheriting an unrelated notion of "clean". */
export function measurementForAlert({ title = '' } = {}) {
  return /\bparallel batch sessions\b/i.test(trim(title)) ? { ...BATCH_DOCTOR_GATE_MEASUREMENT } : null
}

/**
 * Persist one doctor-gate result without losing an earlier clean result.
 *
 * Once a decision has expired, a later incident must not resurrect it. The
 * latest run is still recorded for diagnosis, while `cleanAt` remains the most
 * recent clean proof.
 */
export function recordDoctorGateMeasurement(state, { at = Date.now(), clean = false, detail = '' } = {}) {
  const source = state && typeof state === 'object' ? state : {}
  const measurements = source.measurements && typeof source.measurements === 'object' ? source.measurements : {}
  const previous = measurements[BATCH_DOCTOR_GATE_KEY]
  const prior = previous && typeof previous === 'object' ? previous : {}
  const measuredAt = finitePositive(at) ?? Date.now()
  const previousCleanAt = finitePositive(prior.cleanAt)
  const nextCleanAt = clean ? Math.max(previousCleanAt ?? 0, measuredAt) : previousCleanAt
  const keepPreviousCleanDetail = clean && previousCleanAt && previousCleanAt > measuredAt
  const cleanDetail = keepPreviousCleanDetail
    ? trim(prior.cleanDetail)
    : clean
      ? trim(detail)
      : trim(prior.cleanDetail)

  return {
    ...source,
    measurements: {
      ...measurements,
      [BATCH_DOCTOR_GATE_KEY]: {
        ...prior,
        lastRunAt: measuredAt,
        lastVerdict: clean ? 'clean' : 'dirty',
        ...(trim(detail) ? { lastDetail: trim(detail) } : {}),
        ...(nextCleanAt ? { cleanAt: nextCleanAt } : {}),
        ...(cleanDetail ? { cleanDetail } : {}),
      },
    },
  }
}

const legacyParallelMeasurement = (record) => {
  const text = `${trim(record?.title)} ${trim(record?.body)}`
  return /\bparallel batch sessions\b/i.test(text) ? BATCH_DOCTOR_GATE_MEASUREMENT : null
}

/** The clean result which expires `record`, or null while it still stands. */
export function measurementThatSettled(record, doctorState) {
  if (!record || typeof record !== 'object') return null
  const measurement = record.measurement && typeof record.measurement === 'object'
    ? record.measurement
    : legacyParallelMeasurement(record)
  if (!measurement || trim(measurement.key) !== BATCH_DOCTOR_GATE_KEY) return null

  const decidedAt = finitePositive(record.at)
  if (!decidedAt) return null
  const result = doctorState?.measurements?.[BATCH_DOCTOR_GATE_KEY]
  const cleanAt = finitePositive(result?.cleanAt)
  if (cleanAt && cleanAt >= decidedAt) {
    return {
      ...measurement,
      at: cleanAt,
      verdict: 'clean',
      detail: trim(result.cleanDetail) || 'batch-doctor --gate recorded a clean result',
    }
  }

  // Before point 936 the doctor retained only these two fields. Together they
  // are the strongest durable evidence available for the already-standing
  // PARALLEL decision: a satisfied gate exists and the alert was marked handled
  // after the decision. New runs use the timestamped measurement above.
  const handledAt = finitePositive(doctorState?.handledAt)
  if (
    legacyParallelMeasurement(record) &&
    trim(doctorState?.satisfiedGate) &&
    handledAt &&
    handledAt >= decidedAt
  ) {
    return {
      ...BATCH_DOCTOR_GATE_MEASUREMENT,
      at: handledAt,
      verdict: 'clean',
      detail: 'legacy doctor state records a satisfied gate and the parallel alert as handled',
    }
  }
  return null
}
