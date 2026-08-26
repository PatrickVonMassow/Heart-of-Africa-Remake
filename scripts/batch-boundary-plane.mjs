import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { controlRequest } from './batch-daemon.mjs'
import { requestCheckpoint } from './batch-checkpoint.mjs'
import { authorizeQueue } from './batch-dispatch-core.mjs'
import { deriveSnapshot } from './batch-state-core.mjs'
import { openStateStore, readJournal, readReceipt, readSnapshot, writeFileAtomic, writeReceipt, writeSnapshot } from './batch-state.mjs'
import { readJsonIfAny } from './detached-agent.mjs'
import { durableBoundaryMarker, durableCommitVerdict, durablePrepareReceipt } from './batch-boundary-plane-core.mjs'

const pointerPath = (store) => join(store.dir, 'boundary-prepared.json')
const markerPath = (repoDir) => join(repoDir, '.claude', 'batch-boundary.json')
const cleanWorktree = (repoDir) => {
  try { return execFileSync('git', ['status', '--porcelain'], { cwd: repoDir, encoding: 'utf8', windowsHide: true }).trim() === '' } catch { return false }
}

export async function prepareDurableBoundary({ repoDir, batchId, sessionId, fence, requestId = `boundary-${fence}-${Date.now()}`, checkpointTimeoutMs } = {}) {
  const store = openStateStore({ repoDir, batchId })
  const journal = readJournal(store)
  const snapshotBody = deriveSnapshot(journal.entries, { batchId })
  const snapshotWrite = journal.verdict === 'ok' ? writeSnapshot(store, snapshotBody) : { ok: false }
  const daemonReply = await controlRequest({ repoDir, batchId, request: { cmd: 'status' }, timeoutMs: 3000 })
  const daemon = daemonReply.ok ? (daemonReply.result ?? daemonReply) : daemonReply
  const landing = readJsonIfAny(join(store.dir, 'landing.json'))
  let queue
  try { queue = authorizeQueue(JSON.parse(readFileSync(join(store.dir, 'queue.json'), 'utf8'))?.queue ?? JSON.parse(readFileSync(join(store.dir, 'queue.json'), 'utf8'))) } catch (error) { queue = { ok: false, reason: error.message } }
  const checkpoint = await requestCheckpoint({ repoDir, batchId, sessionId, fence, requestId: `checkpoint-${requestId}`, timeoutMs: checkpointTimeoutMs })
  const evidence = {
    daemon: { ok: daemonReply.ok, journalVerdict: daemon.journalVerdict },
    state: { journalVerdict: journal.verdict, snapshotSealed: snapshotWrite.ok === true },
    landingStage: landing?.stage ?? null,
    bookkeeping: { clean: cleanWorktree(repoDir) },
    board: { readable: existsSync(join(repoDir, '.batch-dashboard.html')), updated: existsSync(join(repoDir, '.batch-dashboard.html')) },
    queue,
    checkpoint,
  }
  const prepared = durablePrepareReceipt({ batchId, sessionId, fence, requestId, at: Date.now(), evidence })
  if (!prepared.ok) return prepared
  const receiptId = `prepare-${requestId}`
  const written = writeReceipt(store, receiptId, prepared.receipt)
  if (!written.ok) return { ok: false, reason: written.reason }
  writeFileAtomic(pointerPath(store), `${JSON.stringify({ receiptId })}\n`)
  return { ok: true, verdict: 'prepared', receiptId, receipt: prepared.receipt }
}

export async function commitDurableBoundary({ repoDir, batchId, sessionId, fence } = {}) {
  const store = openStateStore({ repoDir, batchId })
  const pointer = readJsonIfAny(pointerPath(store))
  const preparedRead = pointer?.receiptId ? readReceipt(store, pointer.receiptId) : { ok: false }
  const prepared = preparedRead.snapshot
  const existingMarker = readJsonIfAny(markerPath(repoDir))
  const decision = durableCommitVerdict({ prepared, batchId, sessionId, fence, snapshot: readSnapshot(store), marker: existingMarker })
  if (!decision.ok) return decision
  if (decision.alreadyCommitted) return { ok: true, alreadyCommitted: true, marker: existingMarker }
  const commitReceiptId = `commit-${fence}`
  const existingCommit = readReceipt(store, commitReceiptId)
  let daemonReceipt = existingCommit.ok ? existingCommit.snapshot.daemonReceipt : null
  if (!daemonReceipt) {
    const sealed = await controlRequest({ repoDir, batchId, request: { cmd: 'seal-boundary', sessionId, fence, payload: { batchId, requestId: prepared.requestId } } })
    if (!sealed.ok) return { ok: false, reason: `daemon refused boundary seal: ${sealed.reason}` }
    daemonReceipt = { ok: true, ...(sealed.result ?? {}), fence }
    const receipt = writeReceipt(store, commitReceiptId, { kind: 'boundary-commit', batchId, fence, requestId: prepared.requestId, daemonReceipt })
    if (!receipt.ok) return { ok: false, reason: receipt.reason }
  }
  const built = durableBoundaryMarker({ prepared, daemonReceipt })
  if (!built.ok) return built
  writeFileAtomic(markerPath(repoDir), `${JSON.stringify(built.marker)}\n`)
  return { ok: true, marker: built.marker, daemonReceipt }
}
