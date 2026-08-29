// Independent context measurements for the durable-lane trial.
//
// A sample never takes `tokens` from an operator. It derives context size from
// one provider transcript response, using the same folding and context-token
// definition as measure-context-cost. `scope: handover` has one precise meaning:
// the last fully recorded coordinator response immediately BEFORE the caller
// initiates a handover. `ordinary` is a response selected by the sealed plan's
// non-handover schedule. The metric journal is not an input to either reading.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checksumOf } from './batch-schema-core.mjs'
import { foldUsage, turnCost } from './measure-context-cost-core.mjs'
import { openStateStore, writeFileAtomic } from './batch-state.mjs'

export const CONTEXT_SAMPLE_SCOPES = Object.freeze(['handover', 'ordinary'])
export const CONTEXT_SAMPLE_DEFINITION = 'provider transcript context tokens; handover is the final complete coordinator response before initiating handover'

export function contextSampleFromTranscript({ text = '', source, scope, recordedAt = Date.now() } = {}) {
  if (!CONTEXT_SAMPLE_SCOPES.includes(scope)) return { ok: false, reason: 'context sample scope is handover or ordinary' }
  if (typeof source !== 'string' || !source.trim()) return { ok: false, reason: 'context sample names its transcript source' }
  const responses = new Map()
  for (const [lineNumber, line] of String(text).split(/\r?\n/).entries()) {
    if (!line.includes('"usage"')) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    const usage = row?.message?.usage
    const at = Date.parse(row?.timestamp ?? '')
    if (!usage || !Number.isFinite(at)) continue
    const responseId = row.message?.id ?? row.requestId ?? row.uuid ?? `${source}:${lineNumber + 1}`
    const known = responses.get(responseId) ?? { responseId, at, usages: [], session: row.sessionId ?? null }
    known.at = Math.max(known.at, at)
    known.usages.push(usage)
    responses.set(responseId, known)
  }
  const latest = [...responses.values()].sort((a, b) => a.at - b.at).at(-1)
  if (!latest) return { ok: false, reason: 'the transcript contains no complete response with usage' }
  const tokens = turnCost(foldUsage(latest.usages)).contextTokens
  if (!(Number.isFinite(tokens) && tokens > 0)) return { ok: false, reason: 'the transcript response has no measurable context tokens' }
  const identity = { source, responseId: latest.responseId, at: latest.at, scope }
  return {
    ok: true,
    sample: Object.freeze({
      sampleId: `context-${checksumOf(identity)}`,
      tokens,
      scope,
      at: latest.at,
      recordedAt,
      session: latest.session,
      source: { kind: 'claude-jsonl-response', path: source, responseId: latest.responseId },
    }),
  }
}

export function recordContextSample({ repoDir, batchId, sample } = {}) {
  const store = openStateStore({ repoDir, batchId })
  const path = join(store.dir, 'context-samples.json')
  let ledger = { v: 1, definition: CONTEXT_SAMPLE_DEFINITION, samples: [] }
  if (existsSync(path)) {
    try { ledger = JSON.parse(readFileSync(path, 'utf8')) } catch { return { ok: false, reason: 'the independent context sample ledger is unreadable' } }
    if (ledger?.v !== 1 || ledger.definition !== CONTEXT_SAMPLE_DEFINITION || !Array.isArray(ledger.samples)) {
      return { ok: false, reason: 'the independent context sample ledger has an unknown shape' }
    }
  }
  if (ledger.samples.some((item) => item?.sampleId === sample?.sampleId)) return { ok: true, path, alreadyRecorded: true, sample }
  if (!sample || !CONTEXT_SAMPLE_SCOPES.includes(sample.scope) || !Number.isFinite(sample.tokens) || !Number.isFinite(sample.at) || typeof sample.sampleId !== 'string') {
    return { ok: false, reason: 'a context sample has an id, measured tokens, scope, and response time' }
  }
  writeFileAtomic(path, `${JSON.stringify({ ...ledger, samples: [...ledger.samples, sample] }, null, 2)}\n`)
  return { ok: true, path, alreadyRecorded: false, sample }
}
