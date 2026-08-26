// READ-ONLY PROGRESS-BOARD PROJECTION — ordered-work step 10. This is the
// canonical data projection; board ownership/publishing remains serial in the
// main session and never becomes a worker mutation.

export const BATCH_ALERT_KINDS = Object.freeze([
  'stalled-worker', 'missing-successor', 'marker-deletion', 'rejected-old-epoch', 'quarantined-evidence',
])

export function projectBatchBoard({ batchId, lanes = [], daemon = null, coordinator = null, queue = [], boundary = null, reasonIntervals = [], now } = {}) {
  if (typeof batchId !== 'string' || !batchId || !Number.isFinite(now)) return { ok: false, reason: 'board projection needs batch identity and a finite observation time' }
  const projectedLanes = lanes.map((lane) => {
    const heartbeatAt = lane.heartbeatAt ?? lane.probes?.heartbeatAt ?? null
    const heartbeatAgeMs = Number.isFinite(heartbeatAt) ? Math.max(0, now - heartbeatAt) : null
    return Object.freeze({
      pointId: lane.pointId ?? null,
      attemptId: lane.attemptId ?? null,
      state: lane.state?.state ?? lane.state ?? lane.reading ?? 'unknown',
      reading: lane.reading ?? null,
      heartbeatAgeMs,
      etaAt: Number.isFinite(lane.etaAt) ? lane.etaAt : null,
      lastCommit: lane.lastCommit ?? lane.state?.lastCommit ?? null,
      lastPushedSha: lane.lastPushedSha ?? lane.state?.lastPushedSha ?? null,
      red: lane.alert === true || lane.quarantine === true,
      mismatch: lane.quarantine ? lane.reason ?? 'quarantined evidence' : lane.alert ? lane.reason ?? 'lane alert' : null,
    })
  })
  const backlog = projectedLanes.filter((lane) => lane.state === 'ready-for-review').length
  const active = projectedLanes.filter((lane) => ['running', 'checkpointing', 'stalled'].includes(lane.state)).length
  const alerts = []
  for (const lane of projectedLanes) {
    if (lane.state === 'stalled' || lane.reading === 'stalled') alerts.push({ kind: 'stalled-worker', attemptId: lane.attemptId, detail: lane.mismatch ?? 'worker heartbeat stalled' })
    if (lane.red && lane.state !== 'stalled' && lane.reading !== 'stalled') alerts.push({ kind: 'quarantined-evidence', attemptId: lane.attemptId, detail: lane.mismatch })
  }
  if (boundary?.sealed === true && boundary?.successorReady !== true) alerts.push({ kind: 'missing-successor', detail: 'a boundary is sealed without successor-ready evidence' })
  if (boundary?.markerPresent === false && Number.isInteger(boundary?.sealedFence)) alerts.push({ kind: 'marker-deletion', detail: `daemon records sealed fence ${boundary.sealedFence} but the marker is absent` })
  for (const rejected of coordinator?.rejectedMutations ?? []) alerts.push({ kind: 'rejected-old-epoch', detail: rejected.reason ?? `rejected fence ${rejected.fence}` })
  return {
    ok: true,
    batchId,
    observedAt: now,
    coordinator: {
      role: coordinator?.role ?? null,
      sessionId: coordinator?.sessionId ?? null,
      epoch: Number.isInteger(coordinator?.fence) ? coordinator.fence : null,
    },
    daemon: { state: daemon?.state ?? daemon?.record?.state ?? 'unknown', generation: daemon?.generation ?? daemon?.record?.generation ?? null },
    lanes: projectedLanes,
    active,
    cap: 3,
    backlog,
    queueDepth: Array.isArray(queue) ? queue.length : 0,
    boundary: boundary ?? { state: 'none' },
    underutilization: reasonIntervals.filter((interval) => interval && !interval.endedAt),
    alerts,
    red: alerts.length > 0,
  }
}

export function batchBoardText(projection) {
  if (!projection?.ok) return `BATCH unavailable — ${projection?.reason ?? 'projection failed'}`
  const head = `BATCH ${projection.batchId} · epoch ${projection.coordinator.epoch ?? '?'} · lanes ${projection.active}/${projection.cap} · backlog ${projection.backlog} · queue ${projection.queueDepth}`
  const lanes = projection.lanes.map((lane) => `${lane.red ? 'RED ' : ''}${lane.pointId ?? '?'}:${lane.attemptId ?? '?'} ${lane.state} heartbeat=${lane.heartbeatAgeMs === null ? '?' : `${Math.round(lane.heartbeatAgeMs / 1000)}s`} ETA=${lane.etaAt ?? '?'}`)
  const alerts = projection.alerts.map((alert) => `ALERT ${alert.kind}: ${alert.detail}`)
  return [head, ...lanes, ...alerts].join('\n')
}
