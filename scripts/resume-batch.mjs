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
// It never refills (that is step 5, 676's remainder), never restarts a daemon,
// and never deletes evidence: its output is the reconciliation report plus the
// adoptions it performed.
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { gatherEvidence, applyPairResolution } from './batch-reconcile.mjs'
import { controlRequest } from './batch-daemon.mjs'

export async function resumeBatch({ repoDir = REPO_ROOT, batchId, sessionId = null } = {}) {
  const report = gatherEvidence({ repoDir, batchId })
  const adoptions = []

  // The pair first, exactly as the table orders it: a successor whose lock is
  // current writes the copy toward the record's truth before it talks to the
  // daemon it is about to trust.
  if (['write-copy-from-record', 'clear-copy'].includes(report.pair.action) && sessionId) {
    report.applied = applyPairResolution({ repoDir, batchId, report, sessionId })
  }

  const daemonLive = ['healthy', 'unadopted', 'superseded-copy'].includes(report.pair.reading)
  if (daemonLive && sessionId && report.lock?.sessionId === sessionId) {
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

  return {
    ...report,
    daemonLive,
    adoptions,
    nextSteps: [
      ...(report.pair.action.startsWith('reconcile-workers') ? ['the daemon record is cold: reconcile its lanes, then apply the release with batch-reconcile --apply'] : []),
      ...(report.lanes.some((l) => l.quarantine) ? ['quarantined lanes await an operator: nothing here declares them complete'] : []),
      ...(report.publications.some((p) => p.quarantine) ? ['UNKNOWN publications are quarantined: resolve them before trusting the affected refs'] : []),
      ...(report.refill.ok ? [] : ['no refill while lanes are red (M29)']),
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
    const red =
      !result.registry.ok ||
      result.quarantined.length > 0 ||
      result.lanes.some((l) => l.quarantine) ||
      result.publications.some((p) => p.quarantine) ||
      result.adoptions.some((a) => !a.ok) ||
      result.pair.action === 'refuse-and-alert' ||
      result.pair.action.startsWith('reconcile-workers') ||
      !result.refill.ok
    process.exit(red ? 1 : 0)
  })
}
