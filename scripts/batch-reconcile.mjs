#!/usr/bin/env node
// EVIDENCE GATHERING FOR SUCCESSOR RECONCILIATION — step 8 of the "Ordered
// work" in docs/handover-architecture.md (work-order point 834, the front stage
// of 676). The decisions live in scripts/batch-reconcile-core.mjs; this file
// reads the durable inputs of union M26 — batch store, journal, daemon record,
// batch lock, worktrees, local and remote branch tips — probes them, and
// returns one report. It MUTATES nothing unless asked: `--apply` performs only
// the idempotent daemon-pair resolutions that write toward the record's own
// truth, and never releases a record whose lanes still read running.
//
//   node scripts/batch-reconcile.mjs --repo <dir> --batch <id> [--apply --session <sid>]
import { execFileSync } from 'node:child_process'
import { existsSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { probePid } from './batch-singleton.mjs'
import { deriveSnapshot, unconfirmedIntents } from './batch-state-core.mjs'
import { openStateStore, readJournal, readSnapshot } from './batch-state.mjs'
import { attemptPaths, readJsonIfAny } from './detached-agent.mjs'
import { classifyLane, daemonPairResolution, mayRefill, registryVerdict, resolvePublicationIntent } from './batch-reconcile-core.mjs'

function git(args, cwd) {
  try {
    return { ok: true, status: 0, out: execFileSync('git', args, { windowsHide: true, cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
  } catch (error) {
    return { ok: false, status: typeof error?.status === 'number' ? error.status : null, out: '', err: error?.stderr?.toString?.() ?? String(error) }
  }
}

function probeOf(pid) {
  if (!Number.isInteger(pid) || pid < 1) return { live: false }
  const probe = probePid(pid)
  return { live: probe?.exists === true, pid, startedAt: probe?.startedAt ?? null }
}

function mtimeOf(path) {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

/** The worktree and branch of an attempt live in its start-attempt command
 *  payload — the journal is the source, so the gatherer reads them from there
 *  rather than trusting any live structure. */
function attemptContext(entries, attemptId) {
  for (const e of entries) {
    if (e.kind === 'command' && e.name === 'start-attempt' && !e.quarantine && e.payload?.attemptId === attemptId) {
      return { worktree: e.payload.worktree ?? null, branch: e.payload.branch ?? null }
    }
  }
  return { worktree: null, branch: null }
}

/** Probes one publishing intent's refs against the REMOTE (mechanism 2): the
 *  ref's current oid by ls-remote, ancestry after fetching the ref, and the
 *  publication id as a commit trailer in the fetched history. Every failure is
 *  an unprobed value, which the resolution reads as UNKNOWN — never as absent. */
function probeIntentRefs(intent, repoDir) {
  const probes = {}
  for (const move of intent.moves ?? []) {
    const name = move.ref.replace(/^refs\/heads\//, '')
    const listed = git(['ls-remote', 'origin', move.ref], repoDir)
    if (!listed.ok) continue
    const refAt = listed.out ? listed.out.split(/\s+/)[0] : null
    let afterIsAncestor = null
    let trailerFound = null
    if (refAt) {
      const fetched = git(['fetch', '-q', 'origin', move.ref], repoDir)
      if (fetched.ok) {
        // Exit 0 is yes, exit 1 is no, anything else is UNPROBED — the missing
        // after-oid object, a shallow history — and unprobed resolves UNKNOWN.
        const ancestry = git(['merge-base', '--is-ancestor', move.afterOid, 'FETCH_HEAD'], repoDir)
        afterIsAncestor = ancestry.status === 0 ? true : ancestry.status === 1 ? false : null
        const trailer = git(['log', '--fixed-strings', `--grep=${intent.publicationId}`, '--format=%H', 'FETCH_HEAD'], repoDir)
        trailerFound = trailer.ok ? trailer.out !== '' : null
      }
    } else {
      // An absent ref cannot carry an ancestor, and its empty history holds no
      // trailer; both are affirmative findings, not failures to look.
      afterIsAncestor = null
      trailerFound = false
    }
    probes[move.ref] = { refAt, afterIsAncestor, trailerFound, name }
  }
  return probes
}

export function gatherEvidence({ repoDir = REPO_ROOT, batchId } = {}) {
  const resolved = resolve(repoDir)
  const store = openStateStore({ repoDir: resolved, batchId })
  const journal = readJournal(store)
  const snapshot = readSnapshot(store)
  const registry = registryVerdict({ journalVerdict: journal.verdict, snapshotVerdict: snapshot.verdict })
  const derived = deriveSnapshot(journal.entries, { batchId })

  const now = Date.now()
  const lanes = derived.attempts.map((attempt) => {
    const context = attemptContext(journal.entries, attempt.attemptId)
    const dir = join(store.dir, 'attempts', attempt.attemptId)
    const paths = attemptPaths(dir)
    const lease = readJsonIfAny(paths.leasePath)?.lease ?? null
    const workerProbe = lease ? probeOf(lease.holder?.pid) : { live: false }
    const worktreeExists = context.worktree ? existsSync(context.worktree) : false
    const localSha = context.worktree && worktreeExists ? git(['rev-parse', 'HEAD'], context.worktree).out || null : null
    const remoteListed = context.branch ? git(['ls-remote', 'origin', `refs/heads/${context.branch}`], resolved) : { ok: false }
    const remoteSha = remoteListed.ok && remoteListed.out ? remoteListed.out.split(/\s+/)[0] : null
    const reading = classifyLane({
      record: attempt,
      workerProbe,
      lease,
      heartbeatAt: mtimeOf(paths.heartbeatPath),
      worktreeExists,
      localSha,
      remoteSha,
      recordedSha: attempt.state?.lastPushedSha ?? null,
      now,
    })
    return { attemptId: attempt.attemptId, pointId: attempt.pointId, state: attempt.state?.state ?? null, ...context, ...reading }
  })

  const record = readJsonIfAny(store.daemonRecordPath)
  const lock = readJsonIfAny(join(resolved, '.claude', 'batch-lock.json'))
  const pair = daemonPairResolution({ record, copy: lock?.daemon ?? null, probe: record ? probeOf(record.pid) : null })

  const publications = unconfirmedIntents(journal.entries).map((entry) =>
    resolvePublicationIntent({ intent: { publicationId: entry.publicationId, moves: entry.moves ?? [] }, refProbes: probeIntentRefs(entry, resolved) }),
  )

  return {
    batchId,
    registry,
    quarantined: derived.quarantined,
    lanes,
    pair,
    publications,
    refill: mayRefill({ lanes }),
    store: { dir: store.dir },
    lock: lock ? { sessionId: lock.sessionId, fence: lock.fence } : null,
  }
}

/** The idempotent pair resolutions. Everything else in the report is for the
 *  successor to act on through the daemon or the operator to read. */
export function applyPairResolution({ repoDir = REPO_ROOT, batchId, report, sessionId = null } = {}) {
  const resolved = resolve(repoDir)
  const store = openStateStore({ repoDir: resolved, batchId })
  const lockPath = join(resolved, '.claude', 'batch-lock.json')
  const lock = readJsonIfAny(lockPath)
  const writeLock = (next) => {
    const tmp = `${lockPath}.tmp-${process.pid}`
    writeFileSync(tmp, `${JSON.stringify(next)}\n`)
    renameSync(tmp, lockPath)
  }
  const { action } = report.pair
  if (action === 'none') return { ok: true, did: 'nothing to do' }
  if (action === 'refuse-and-alert') return { ok: false, did: 'refused: the pair is impossible by construction; an operator resolves this' }
  if (!lock || lock.sessionId !== sessionId) return { ok: false, did: 'only the lock owner applies pair resolutions' }
  if (action === 'clear-copy') {
    const next = { ...lock }
    delete next.daemon
    writeLock(next)
    return { ok: true, did: 'cleared the orphaned copy' }
  }
  if (action === 'write-copy-from-record') {
    const record = readJsonIfAny(store.daemonRecordPath)
    if (!record) return { ok: false, did: 'the record vanished under the resolution; rerun reconciliation' }
    writeLock({ ...lock, daemon: { pid: record.pid, pidStartedAt: record.pidStartedAt, generation: record.generation } })
    return { ok: true, did: 'wrote the copy from the record' }
  }
  // The cold-record family: workers first, record last — and never while any
  // lane still reads running.
  const running = report.lanes.filter((lane) => lane.reading === 'running')
  if (running.length) return { ok: false, did: `refused: ${running.length} lane(s) still read running under a cold record; that is a contradiction to investigate, not to delete` }
  try {
    unlinkSync(store.daemonRecordPath)
  } catch {
    /* already released — idempotence is the point */
  }
  const next = { ...lock }
  delete next.daemon
  writeLock(next)
  return { ok: true, did: 'released the cold record and cleared its copy; a new daemon mints a new generation' }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const batchId = arg('--batch')
  if (!batchId) {
    console.error('usage: node scripts/batch-reconcile.mjs --repo <dir> --batch <id> [--apply --session <sid>]')
    process.exit(2)
  }
  const repoDir = arg('--repo') ?? REPO_ROOT
  const report = gatherEvidence({ repoDir, batchId })
  if (argv.includes('--apply')) {
    report.applied = applyPairResolution({ repoDir, batchId, report, sessionId: arg('--session') ?? null })
  }
  console.log(JSON.stringify(report, null, 2))
  const red = !report.registry.ok || report.lanes.some((l) => l.quarantine) || report.publications.some((p) => p.quarantine) || report.pair.action === 'refuse-and-alert'
  process.exit(red ? 1 : 0)
}
