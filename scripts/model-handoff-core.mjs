// Pure state machine for a forbidden-serving-model handoff.
//
// The session whose trailer triggered the tripwire may record the breach and ask
// for another lane, but it can never clear its own finding. A fresh session must
// prove from transcript metadata that it is the recorded target (or a later
// allowed fallback), then the wrapper re-reads every trailer before advancing the
// baseline. When every recorded lane has failed, the chain starts a fresh probe
// after a clock instead of manufacturing a permanent human hold.

import { sameModel } from './mechanism-review-core.mjs'

export const MODEL_HANDOFF_VERSION = 1
export const MODEL_HANDOFF_PROBE_MS = 20 * 60 * 1000

const cleanRoute = (route) =>
  (Array.isArray(route) ? route : [])
    .map((lane) => ({ model: String(lane?.model ?? '').trim(), id: String(lane?.id ?? '').trim() }))
    .filter((lane) => lane.model && lane.id)

const cleanHits = (hits) =>
  (Array.isArray(hits) ? hits : [])
    .map((hit) => ({
      sha: String(hit?.sha ?? '').trim(),
      trailer: String(hit?.trailer ?? '').trim(),
      when: Number(hit?.when),
    }))
    .filter((hit) => hit.sha && hit.trailer && Number.isFinite(hit.when))

export function readModelHandoff(value) {
  if (!value || typeof value !== 'object' || value.version !== MODEL_HANDOFF_VERSION) return null
  const route = cleanRoute(value.route)
  const targetIndex = Number(value.targetIndex)
  const requestedBy = String(value.requestedBy ?? '').trim()
  const requestedAt = Number(value.requestedAt)
  const probeAfter = value.probeAfter == null ? null : Number(value.probeAfter)
  if (!route.length || !Number.isSafeInteger(targetIndex) || targetIndex < 0 || targetIndex >= route.length) return null
  if (!requestedBy || !Number.isFinite(requestedAt)) return null
  if (probeAfter !== null && !Number.isFinite(probeAfter)) return null
  const offending = cleanHits(value.offending)
  return {
    version: MODEL_HANDOFF_VERSION,
    route,
    targetIndex,
    requestedBy,
    requestedAt,
    probeAfter,
    offending,
    decisionRecord: value.decisionRecord && typeof value.decisionRecord === 'object'
      ? value.decisionRecord
      : modelHandoffDecisionRecord({ route, targetIndex, now: requestedAt, hits: offending, probeAfter }),
  }
}

export function modelHandoffDecisionRecord({ route, targetIndex, now, hits, probeAfter = null } = {}) {
  const lanes = cleanRoute(route)
  const target = lanes[targetIndex]?.model ?? 'recorded allowed serving lane'
  const offending = cleanHits(hits).map((hit) => hit.sha.slice(0, 12)).join(', ') || 'unknown commit'
  const next = Number.isFinite(probeAfter)
    ? `Nächster Versuch: ${new Date(probeAfter).toISOString()}.`
    : `Nächster Versuch: sofortige Übergabe an ${target}.`
  return {
    title: `Entscheidungsprotokoll: Verbotener Autor wird an ${target} übergeben`.slice(0, 160),
    body:
      `Automatische Entscheidung [${new Date(now).toISOString()}]: Die verdächtige Lane darf ihre eigenen ` +
      `Trailer ${offending} nicht bestätigen. Verifikationsziel: ${target}. ${next} Die Baseline bleibt bis zum ` +
      `Transcript-Beweis unverändert. Retroaktives Veto: Antworte mit „Veto“ und nenne die stattdessen zu ` +
      `verwendende erlaubte Lane; ein Veto darf die Trailer-Prüfung nicht überspringen.`,
  }
}

const stateFor = ({ route, targetIndex, sessionId, now, hits, probeAfter = null }) => {
  const cleanedRoute = cleanRoute(route)
  return {
    version: MODEL_HANDOFF_VERSION,
    route: cleanedRoute,
    targetIndex,
    requestedBy: String(sessionId ?? '').trim(),
    requestedAt: now,
    probeAfter,
    offending: cleanHits(hits),
    decisionRecord: modelHandoffDecisionRecord({ route: cleanedRoute, targetIndex, now, hits, probeAfter }),
  }
}

const routeIndexOf = (model, route) => route.findIndex((lane) => sameModel(model, lane.model) || sameModel(model, lane.id))

/** Decide the next trusted action from current git evidence and transcript proof. */
export function modelHandoffDecision({
  hits = [],
  unidentified = [],
  state = null,
  route = [],
  sessionId = '',
  currentModel = '',
  baselineMs = 0,
  now = Date.now(),
  probeMs = MODEL_HANDOFF_PROBE_MS,
} = {}) {
  const found = cleanHits(hits)
  if (!found.length) return { action: 'none', reason: 'no forbidden trailer remains' }
  const sid = String(sessionId ?? '').trim()
  const recorded = readModelHandoff(state)
  const initialRoute = cleanRoute(route)

  if (!recorded) {
    if (!sid || initialRoute.length < 2) {
      const delay = Number.isFinite(probeMs) && probeMs > 0 ? probeMs : MODEL_HANDOFF_PROBE_MS
      const probeRoute = initialRoute.length ? initialRoute : cleanRoute(route)
      if (!probeRoute.length) return { action: 'block', reason: 'no recorded serving route can carry the breach' }
      const requester = sid || 'model-guard-clocked-probe'
      const next = {
        action: 'probe',
        state: stateFor({ route: probeRoute, targetIndex: 0, sessionId: requester, now, hits: found, probeAfter: now + delay }),
        retryAfter: now + delay,
        reason: 'no next allowed lane is recorded; probe the serving chain on a clock',
      }
      return { ...next, decisionRecord: next.state.decisionRecord }
    }
    const next = {
      action: 'handoff',
      state: stateFor({ route: initialRoute, targetIndex: 1, sessionId: sid, now, hits: found }),
      reason: `the suspect primary may not verify itself; hand over to ${initialRoute[1].model}`,
    }
    return { ...next, decisionRecord: next.state.decisionRecord }
  }

  // Re-running the Stop hook in the requesting session must not consume a lane
  // that has not run. It only retries the same durable handoff transport.
  if (sid && sid === recorded.requestedBy) {
    return { action: 'handoff', state: { ...recorded, offending: found }, decisionRecord: recorded.decisionRecord, reason: 'the requesting session still awaits its recorded target' }
  }

  if (!String(currentModel ?? '').trim()) {
    const retryAfter = now + (Number.isFinite(probeMs) && probeMs > 0 ? probeMs : MODEL_HANDOFF_PROBE_MS)
    const next = {
      action: 'probe',
      state: stateFor({ route: recorded.route, targetIndex: recorded.targetIndex, sessionId: sid || recorded.requestedBy, now, hits: found, probeAfter: retryAfter }),
      retryAfter,
      reason: 'the target transcript names no serving model; it cannot prove the baseline and is retried on a clock',
    }
    return { ...next, decisionRecord: next.state.decisionRecord }
  }

  const actualIndex = routeIndexOf(currentModel, recorded.route)
  if (actualIndex >= recorded.targetIndex) {
    if ((unidentified ?? []).length) {
      const retryAfter = now + (Number.isFinite(probeMs) && probeMs > 0 ? probeMs : MODEL_HANDOFF_PROBE_MS)
      const next = {
        action: 'probe',
        state: stateFor({ route: recorded.route, targetIndex: 0, sessionId: sid || recorded.requestedBy, now, hits: found, probeAfter: retryAfter }),
        retryAfter,
        reason: 'the trusted lane found unidentified trailers beside the breach; baseline proof is incomplete',
      }
      return { ...next, decisionRecord: next.state.decisionRecord }
    }
    const verifiedThrough = Math.max(...found.map((hit) => hit.when))
    if (!Number.isFinite(verifiedThrough) || verifiedThrough <= Number(baselineMs)) {
      return { action: 'block', reason: 'the offending trailer range has no advanceable timestamp' }
    }
    return {
      action: 'verify',
      verifiedBy: recorded.route[actualIndex].model,
      verifiedThrough,
      offending: found,
      reason: `${recorded.route[actualIndex].model} proved the recorded handoff and re-read every offending trailer`,
    }
  }

  const nextIndex = recorded.targetIndex + 1
  if (nextIndex < recorded.route.length) {
    const next = {
      action: 'handoff',
      state: stateFor({ route: recorded.route, targetIndex: nextIndex, sessionId: sid || recorded.requestedBy, now, hits: found }),
      reason: `${recorded.route[recorded.targetIndex].model} was not served; hand over to ${recorded.route[nextIndex].model}`,
    }
    return { ...next, decisionRecord: next.state.decisionRecord }
  }

  const retryAfter = now + (Number.isFinite(probeMs) && probeMs > 0 ? probeMs : MODEL_HANDOFF_PROBE_MS)
  const next = {
    action: 'probe',
    state: stateFor({ route: recorded.route, targetIndex: 0, sessionId: sid || recorded.requestedBy, now, hits: found, probeAfter: retryAfter }),
    retryAfter,
    reason: 'no allowed lane was reachable; probe the recorded chain again on a clock',
  }
  return { ...next, decisionRecord: next.state.decisionRecord }
}

/** The launcher's explicit model and one-way verification prompt. */
export function modelHandoffSpawn(value, now = Date.now()) {
  const state = readModelHandoff(value)
  if (!state) return null
  if (state.probeAfter !== null && state.probeAfter > now) return { waitMs: state.probeAfter - now, state }
  const target = state.route[state.targetIndex]
  const fallback = state.route[state.targetIndex + 1] ?? null
  return {
    state,
    model: target.id,
    fallbackModel: fallback?.id ?? null,
    prompt:
      `SERVING-MODEL TRIPWIRE HANDOFF. You are the recorded ${target.model} verification lane. ` +
      `Do no batch work and author no commit. Read the Co-Authored-By trailers named by ` +
      `.claude/model-guard-handoff.json, compare them with the repository log, report what you found, ` +
      `then end this response. The Stop hook advances the baseline only if transcript metadata proves ` +
      `this recorded lane actually answered.`,
  }
}
