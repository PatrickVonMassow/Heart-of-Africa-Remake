// PROVE WHO WROTE AN ARTEFACT FROM THE SESSION TRANSCRIPT (point 840).
//
// A model name written inside an artefact is a claim. The harness's transcript
// is the evidence: every assistant message carries the serving model in
// `message.model`. The lookup is deliberately per message, because one session
// may switch models. Sidechain messages are deliberately retained, because a
// delegated artefact belongs to the model in that sidechain, not to the parent.
//
// Pure on purpose. scripts/authorship-check.mjs owns file I/O; blind-merge and
// mechanism-review consume the same verdict rather than reimplementing it.
import { sameModel } from './mechanism-review-core.mjs'

/** Model designations accepted from a prose heading. JSON uses its `model` field. */
const MODEL_IN_HEADING =
  /\b(GPT[\s-]*\d+(?:\.\d+)?[\s-]*Sol|Sol(?:[\s-]*\d+(?:\.\d+)?)?|Claude[\s-]+(?:Opus|Fable|Sonnet|Haiku)(?:[\s-]*\d+(?:\.\d+)?)?|(?:Opus|Fable|Sonnet|Haiku)(?:[\s-]*\d+(?:\.\d+)?)?)\b/i

/** The claimed model in a machine-readable half or its first markdown heading. */
export function claimedModelFromArtifact(text) {
  const raw = String(text ?? '')
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) && typeof parsed?.model === 'string') return parsed.model.trim()
  } catch {
    // A prose artefact is expected to be non-JSON.
  }
  const heading = raw.split(/\r?\n/).find((line) => /^\s*#(?:\s|$)/.test(line)) ?? ''
  return (heading.match(MODEL_IN_HEADING)?.[1] ?? '').trim()
}

/** One timestamp in the transcript/CLI domain, or null when it is unusable. */
export function parseArtifactTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Decode the evidence-bearing messages and the transcript's time coverage.
 * Torn/malformed lines are ignored, but a transcript with no readable time
 * coverage is unreadable rather than an empty session.
 */
export function readTranscriptMessages(text) {
  const messages = []
  const eventTimes = []
  let malformedLines = 0
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      malformedLines++
      continue
    }
    const at = parseArtifactTime(entry?.timestamp)
    if (at !== null) eventTimes.push(at)
    const model = typeof entry?.message?.model === 'string' ? entry.message.model.trim() : ''
    if (at === null || !model || entry?.message?.role !== 'assistant') continue
    messages.push({
      at,
      model,
      messageId: String(entry?.message?.id ?? entry?.uuid ?? '').trim(),
      sidechain: entry?.isSidechain === true,
    })
  }
  messages.sort((a, b) => a.at - b.at)
  eventTimes.sort((a, b) => a - b)
  return {
    messages,
    firstAt: eventTimes[0] ?? null,
    lastAt: eventTimes.at(-1) ?? null,
    malformedLines,
  }
}

/** The last model-bearing assistant message at or before an artefact timestamp. */
export function messageAtArtifact(reading, at) {
  const stamp = parseArtifactTime(at)
  if (stamp === null || reading?.firstAt == null || reading?.lastAt == null) return null
  // Outside the transcript is not evidence. In particular, a recovered file's
  // current mtime must not inherit the model from a session that ended days ago.
  if (stamp < reading.firstAt || stamp > reading.lastAt) return null
  let found = null
  for (const message of reading.messages ?? []) {
    if (message.at > stamp) break
    found = message
  }
  return found
}

/**
 * Compare one authorship claim with the message metadata that can prove it.
 *
 * status:
 *   agreement     the claim and message.model name the same model
 *   disagreement  they name different models (permission tooling must refuse)
 *   unverified    no transcript reading covers the artefact timestamp
 *   unclaimed     the artefact names no model at all
 */
export function checkAuthorship({ claimedModel = '', artifactAt, transcriptText = null } = {}) {
  const claimed = String(claimedModel ?? '').trim()
  const at = parseArtifactTime(artifactAt)
  if (!claimed) {
    return {
      status: 'unclaimed',
      claimedModel: '',
      actualModel: '',
      artifactAt: at,
      messageAt: null,
      messageId: '',
      sidechain: false,
      reason: 'the artefact names no model',
    }
  }
  if (at === null) {
    return {
      status: 'unverified',
      claimedModel: claimed,
      actualModel: '',
      artifactAt: null,
      messageAt: null,
      messageId: '',
      sidechain: false,
      reason: 'the artefact timestamp is missing or unreadable',
    }
  }
  if (transcriptText == null) {
    return {
      status: 'unverified',
      claimedModel: claimed,
      actualModel: '',
      artifactAt: at,
      messageAt: null,
      messageId: '',
      sidechain: false,
      reason: 'the session transcript is missing or unreadable',
    }
  }
  const reading = readTranscriptMessages(transcriptText)
  const message = messageAtArtifact(reading, at)
  if (!message) {
    return {
      status: 'unverified',
      claimedModel: claimed,
      actualModel: '',
      artifactAt: at,
      messageAt: null,
      messageId: '',
      sidechain: false,
      reason: reading.messages.length
        ? 'the transcript has no model-bearing message covering the artefact timestamp'
        : 'the transcript has no readable message.model metadata',
    }
  }
  const agrees = sameModel(claimed, message.model)
  return {
    status: agrees ? 'agreement' : 'disagreement',
    claimedModel: claimed,
    actualModel: message.model,
    artifactAt: at,
    messageAt: message.at,
    messageId: message.messageId,
    sidechain: message.sidechain,
    reason: agrees
      ? 'the claimed author agrees with message.model'
      : 'the claimed author disagrees with message.model',
  }
}

export const authorshipRefusesPermission = (result) => result?.status === 'disagreement'

export function formatAuthorship(result, label = 'artefact') {
  const name = String(label ?? '').trim() || 'artefact'
  if (result?.status === 'agreement') {
    return `${name}: AGREEMENT — claimed "${result.claimedModel}"; transcript says "${result.actualModel}"` +
      `${result.sidechain ? ' (delegated sidechain)' : ''}`
  }
  if (result?.status === 'disagreement') {
    return `${name}: DISAGREEMENT — claimed "${result.claimedModel}"; transcript says "${result.actualModel}"` +
      `${result.sidechain ? ' (delegated sidechain)' : ''}`
  }
  if (result?.status === 'unclaimed') return `${name}: NO CLAIM — ${result.reason}`
  return `${name}: UNVERIFIED — ${result?.reason || 'the transcript could not be read'}`
}
