#!/usr/bin/env node
import { join, resolve } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { gatherEvidence } from './batch-reconcile.mjs'
import { openStateStore, readJournal } from './batch-state.mjs'
import { readJsonIfAny } from './detached-agent.mjs'
import { batchBoardText, projectBatchBoard } from './batch-board-core.mjs'

export function gatherBatchBoard({ repoDir = REPO_ROOT, batchId, now = Date.now() } = {}) {
  const report = gatherEvidence({ repoDir, batchId })
  const store = openStateStore({ repoDir, batchId })
  const journal = readJournal(store)
  const marker = readJsonIfAny(join(repoDir, '.claude', 'batch-boundary.json'))
  const sealedFence = journal.entries.reduce((highest, entry) => entry.kind === 'command' && entry.name === 'seal-boundary' && !entry.quarantine ? Math.max(highest, entry.fence ?? 0) : highest, 0) || null
  const queue = readJsonIfAny(join(store.dir, 'queue.json'))?.queue ?? []
  const successorReady = journal.entries.some((entry) => entry.kind === 'command' && entry.name === 'adopt-attempt' && entry.fence > (marker?.fence ?? Infinity))
  return projectBatchBoard({
    batchId, now, lanes: report.lanes,
    daemon: report.daemonRecord,
    coordinator: { sessionId: report.lock?.sessionId, fence: report.lock?.fence, role: marker ? 'successor' : 'dispatcher', rejectedMutations: [] },
    queue,
    boundary: { state: marker?.phase ?? 'none', markerPresent: marker !== null, sealed: sealedFence !== null, sealedFence, successorReady },
  })
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const arg = (name) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : null
  const batchId = arg('--batch')
  if (!batchId) { console.error('usage: node scripts/batch-board.mjs --batch <id> [--repo <dir>] [--json]'); process.exit(2) }
  const projection = gatherBatchBoard({ repoDir: resolve(arg('--repo') ?? REPO_ROOT), batchId })
  console.log(argv.includes('--json') ? JSON.stringify(projection, null, 2) : batchBoardText(projection))
  process.exit(projection.ok && !projection.red ? 0 : 1)
}
