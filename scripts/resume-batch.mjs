#!/usr/bin/env node
// THE SUCCESSOR'S STARTUP — step 8 of the "Ordered work" in
// docs/handover-architecture.md (work-order point 834, the front stage of 676;
// union M26-M29). A fresh session that finds a batch it did not run locates the
// durable inputs, RECONCILES before it spawns anything, and adopts supervision
// of running lanes through the daemon — by OPERATION, not by reading: adoption
// is a fenced daemon mutation, and a lane it cannot adopt stays in the report
// as exactly what it is.
//
//   node scripts/resume-batch.mjs --batch <id> [--repo <dir>] [--session <sid>]
//
// It never restarts a daemon and never deletes evidence. After reconciliation,
// successful adoption, and a proved boundary, it may refill through step 5's
// bounded dispatcher — never before.
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { gatherEvidence, applyPairResolution } from './batch-reconcile.mjs'
import { controlRequest } from './batch-daemon.mjs'
import { reconcileExitRed, successorBoundaryVerdict } from './batch-reconcile-core.mjs'
import { dispatchOnce } from './batch-dispatch.mjs'
import { openStateStore, readJournal, writeReceipt } from './batch-state.mjs'
import { readJsonIfAny } from './detached-agent.mjs'
import { join } from 'node:path'

export async function resumeBatch({ repoDir = REPO_ROOT, batchId, sessionId = null, refill = true, dispatch = dispatchOnce } = {}) {
  const report = gatherEvidence({ repoDir, batchId })
  const adoptions = []
  const store = openStateStore({ repoDir, batchId })
  const marker = readJsonIfAny(join(repoDir, '.claude', 'batch-boundary.json'))
  const sealedFence = readJournal(store).entries.reduce(
    (highest, entry) => entry.kind === 'command' && entry.name === 'seal-boundary' && !entry.quarantine ? Math.max(highest, entry.fence ?? 0) : highest,
    0,
  ) || null
  const boundary = successorBoundaryVerdict({ marker, batchId, lock: report.lock, sealedFence })

  // The pair first, exactly as the table orders it: a successor whose lock is
  // current writes the copy toward the record's truth before it talks to the
  // daemon it is about to trust.
  if (['write-copy-from-record', 'clear-copy'].includes(report.pair.action) && sessionId) {
    report.applied = applyPairResolution({ repoDir, batchId, report, sessionId })
  }

  const daemonLive = ['healthy', 'unadopted', 'superseded-copy'].includes(report.pair.reading)
  if (boundary.ok && daemonLive && sessionId && report.lock?.sessionId === sessionId) {
    for (const lane of report.lanes) {
      if (lane.reading !== 'running') continue
      const reply = await controlRequest({
        repoDir,
        batchId,
        request: {
          cmd: 'adopt-attempt',
          sessionId,
          fence: report.lock.fence,
          payload: { batchId, attemptId: lane.attemptId, fence: report.lock.fence },
        },
      })
      adoptions.push({ attemptId: lane.attemptId, ok: reply.ok === true, reason: reply.reason ?? null })
    }
  }

  const reconciled = !reconcileExitRed(report) && boundary.ok && adoptions.every((adoption) => adoption.ok)
  let successorReceipt = null
  let refillResult = null
  if (reconciled) {
    successorReceipt = writeReceipt(store, `successor-${report.lock.fence}`, {
      kind: 'successor-ready', batchId, sessionId, fence: report.lock.fence, boundaryFence: boundary.markerFence,
      requestId: boundary.requestId, lanes: report.lanes.map((lane) => ({ attemptId: lane.attemptId, reading: lane.reading })),
    })
    if (!successorReceipt.ok) {
      refillResult = { ok: false, reason: `successor-ready receipt failed: ${successorReceipt.reason}` }
    } else if (refill) {
      refillResult = await dispatch({ repoDir, batchId, sessionId, fence: report.lock.fence })
    }
  }

  return {
    ...report,
    boundary,
    daemonLive,
    adoptions,
    successorReceipt,
    refillResult,
    nextSteps: [
      ...(report.pair.action.startsWith('reconcile-workers') ? ['the daemon record is cold: reconcile its lanes, then apply the release with batch-reconcile --apply'] : []),
      ...(report.lanes.some((l) => l.quarantine) ? ['quarantined lanes await an operator: nothing here declares them complete'] : []),
      ...(report.publications.some((p) => p.quarantine) ? ['UNKNOWN publications are quarantined: resolve them before trusting the affected refs'] : []),
      ...(report.refill.ok ? [] : ['no refill while lanes are red (M29)']),
      ...(!boundary.ok ? [`boundary quarantine: ${boundary.reason}`] : []),
    ],
  }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const batchId = arg('--batch')
  if (!batchId) {
    console.error('usage: node scripts/resume-batch.mjs --batch <id> [--repo <dir>] [--session <sid>]')
    process.exit(2)
  }
  resumeBatch({ repoDir: arg('--repo') ?? REPO_ROOT, batchId, sessionId: arg('--session') ?? null }).then((result) => {
    console.log(JSON.stringify(result, null, 2))
    // GREEN MEANS RESOLVED: an UNKNOWN publication, a cold daemon record whose
    // workers still await reconciliation, quarantined evidence and a refused
    // refill are all unresolved startup — automation must see red for each.
    const red = reconcileExitRed(result) || !result.boundary.ok || result.adoptions.some((a) => !a.ok) || result.successorReceipt?.ok === false || result.refillResult?.ok === false
    process.exit(red ? 1 : 0)
  })
}
