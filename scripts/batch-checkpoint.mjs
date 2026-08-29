#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { controlRequest } from './batch-daemon.mjs'
import { openStateStore, writeReceipt } from './batch-state.mjs'
import { daemonCheckpointVerdict, DEFAULT_CHECKPOINT_TIMEOUT_MS } from './batch-checkpoint-core.mjs'
import { recordMetricEvent } from './batch-metric-events.mjs'

export const checkpointRequestId = () => `checkpoint-${Date.now()}-${randomBytes(6).toString('hex')}`

export async function requestCheckpoint({
  repoDir, batchId, sessionId, fence, requestId = checkpointRequestId(), timeoutMs = DEFAULT_CHECKPOINT_TIMEOUT_MS,
  request = controlRequest, recordMetric = recordMetricEvent, now = Date.now,
  openStore = openStateStore, writeDurableReceipt = writeReceipt,
} = {}) {
  if (!sessionId || !Number.isInteger(fence)) return { ok: false, verdict: 'invalid', reason: 'checkpoint is fenced: sessionId and integer fence are required' }
  const requestedAt = now()
  const reply = await request({
    repoDir, batchId, timeoutMs: timeoutMs + 5000,
    request: { cmd: 'request-checkpoint', sessionId, fence, payload: { batchId, requestId, waitMs: timeoutMs } },
  })
  if (!reply.ok) return { ok: false, verdict: 'blocked', requestId, reason: reply.reason }
  const result = reply.result ?? reply
  const verdict = daemonCheckpointVerdict({ requestId, answers: result.answers })
  const completedAt = now()
  const store = openStore({ repoDir, batchId })
  const receipt = writeDurableReceipt(store, requestId, { kind: 'checkpoint', batchId, fence, at: completedAt, verdict })
  if (!receipt.ok) return { ok: false, verdict: 'blocked', requestId, reason: `checkpoint receipt failed: ${receipt.reason}`, checkpoint: verdict }
  const acknowledged = (result.answers ?? []).map((answer) => answer?.acknowledgedAt).filter(Number.isFinite)
  const metric = await recordMetric({
    repoDir, batchId, sessionId, fence, request, eventId: `checkpoint-${requestId}`,
    event: {
      kind: 'checkpoint', at: completedAt, requestId, requestedAt,
      acknowledgedAt: acknowledged.length ? Math.max(...acknowledged) : completedAt,
      lanes: (result.answers ?? []).length, transferable: verdict.ok === true,
    },
  })
  if (!metric.ok) return { ok: false, verdict: 'blocked', requestId, reason: `checkpoint metric failed: ${metric.reason}`, checkpoint: verdict, receipt, metric }
  return { ...verdict, receipt, metric }
}

function parse(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i]
  return out
}

if (isMainModule(import.meta.url)) {
  const args = parse(process.argv.slice(2))
  const result = await requestCheckpoint({ repoDir: resolve(args.repo ?? REPO_ROOT), batchId: args.batch, sessionId: args.session, fence: Number(args.fence), requestId: args.request, timeoutMs: args.timeout ? Number(args.timeout) : undefined })
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.ok ? 0 : 1)
}
