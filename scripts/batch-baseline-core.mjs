// Pure reconstruction of today's-path baseline from measured repository history.
import { ACTIVITY_EVENTS, parseActivityJournal } from './batch-activity-journal-core.mjs'
import { turnCost } from './measure-context-cost-core.mjs'
import { parseBoundaryLog } from './measure-point-cost-core.mjs'

const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const median = (values) => {
  const sorted = values.filter(finite).sort((a, b) => a - b)
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length / 2) - 1)] : null
}

export function utcDayWindow(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return { ok: false, reason: 'baseline day is YYYY-MM-DD in UTC' }
  const start = Date.parse(`${day}T00:00:00.000Z`)
  if (!finite(start) || new Date(start).toISOString().slice(0, 10) !== day) return { ok: false, reason: 'baseline day is a real YYYY-MM-DD date in UTC' }
  return { ok: true, start, end: start + 86_400_000 }
}

export function landingPointFromCommit(commit = {}) {
  const subject = String(commit.subject ?? '')
  const point = Number(subject.match(/feat\/(\d+)(?:[-/]|\b)/)?.[1])
  return Number.isInteger(point) && point > 0 ? point : null
}

function handoversFromHistory(activityText, boundaryText, window) {
  const activity = parseActivityJournal(activityText)
  const fromActivity = activity.records
    .filter((row) => row.event === ACTIVITY_EVENTS.HANDOVER && row.atMs >= window.start && row.atMs < window.end)
    .map((row) => ({ at: row.atMs, session: row.session, source: 'batch-activity.jsonl' }))
  const fromBoundary = parseBoundaryLog(boundaryText)
    .filter((row) => row.at >= window.start && row.at < window.end)
    .map((row) => ({ at: row.at, session: row.session, source: 'boundary.log' }))
  const handovers = []
  for (const event of [...fromActivity, ...fromBoundary].sort((a, b) => a.at - b.at)) {
    const duplicate = handovers.some((known) => known.session === event.session && Math.abs(known.at - event.at) <= 1000)
    if (!duplicate) handovers.push(event)
  }
  return { handovers, rejectedActivityLines: activity.rejected }
}

export function baselineReportFromHistory({ day, activityText = '', boundaryText = '', turns = [], commits = [], sources = {} } = {}) {
  const window = utcDayWindow(day)
  if (!window.ok) return window
  const { handovers, rejectedActivityLines } = handoversFromHistory(activityText, boundaryText, window)
  const topLevel = turns
    .filter((turn) => turn?.scope !== 'subagent' && finite(turn?.at) && turn.at >= window.start && turn.at < window.end)
    .map((turn) => ({ ...turn, tokens: turnCost(turn.usage).contextTokens }))
    .filter((turn) => turn.tokens > 0)
  const samples = []
  for (const handover of handovers) {
    const candidates = topLevel
      .filter((turn) => turn.session === handover.session && turn.at <= handover.at)
      .sort((a, b) => a.at - b.at)
    const turn = candidates.at(-1)
    if (turn) samples.push({ tokens: turn.tokens, scope: 'handover', at: turn.at, handoverAt: handover.at, session: handover.session, source: handover.source })
  }
  if (!samples.length) return { ok: false, reason: 'the baseline day has no transcript context matched to a recorded handover' }

  const landed = new Map()
  for (const commit of commits) {
    if (!finite(commit?.at) || commit.at < window.start || commit.at >= window.end) continue
    const point = landingPointFromCommit(commit)
    if (point !== null && !landed.has(point)) landed.set(point, { point, sha: commit.sha ?? null, at: commit.at })
  }
  const pointsPerDay = landed.size
  return {
    ok: true,
    kind: 'baseline',
    day,
    window: { start: window.start, end: window.end },
    sources,
    sourceHealth: {
      activityRecordsRejected: rejectedActivityLines,
      handoversRead: handovers.length,
      handoversMatched: samples.length,
      firstParentLandingPoints: [...landed.values()],
    },
    planHash: null,
    utilization: null,
    capacityMs: 0,
    runningMs: 0,
    backlogPressureMs: 0,
    p95CheckpointWaitMs: null,
    p95SuccessorReadyMs: null,
    carriedWorkers: 0,
    medianLandingDurationMs: null,
    safetyIncidents: [],
    safetyIncidentCount: 0,
    highContextShare: null,
    medianHandoverContext: median(samples.map((sample) => sample.tokens)),
    contextSamples: samples,
    pointsLanded: landed.size,
    pointsPerDay,
  }
}
