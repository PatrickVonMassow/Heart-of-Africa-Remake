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
import { probePid, withLockWriteMutex } from './batch-singleton.mjs'
import { PUBLICATION_TRAILER_KEY } from './batch-schema-core.mjs'
import { deriveSnapshot, unconfirmedIntents } from './batch-state-core.mjs'
import { openStateStore, readJournal, readSnapshot } from './batch-state.mjs'
import { attemptPaths, readJsonIfAny } from './detached-agent.mjs'
import { classifyLane, daemonPairResolution, mayRefill, reconcileExitRed, registryVerdict, resolvePublicationIntent } from './batch-reconcile-core.mjs'

/** Test seam: called inside the lock mutex, before the in-mutex revalidation.
 *  A test hooks it to mutate the lock at exactly the point a racing takeover
 *  would, proving the revalidation runs INSIDE the critical section. */
export const reconcileProbe = { onMutexEntered: null }

/** The branch a LANDED claim must be visible on. Landing merges to main and
 *  deletes the worker branch (CLAUDE.md §6), so the worker branch's tip proves
 *  nothing about a landing — only reachability from the target does. */
export const LANDING_TARGET_REF = 'refs/heads/main'

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

/** Probes one publishing intent's refs against the REMOTE (mechanism 2), as
 *  ONE COHERENT OBSERVATION PER REF: the ref is fetched into a private
 *  per-process ref, and the oid, the ancestry verdict and the trailer scan
 *  are all read from THAT snapshot. Reading the oid by ls-remote and the
 *  history through shared FETCH_HEAD would let a ref move — or a concurrent
 *  fetch — combine an old oid with a newer history and falsely conclude
 *  ABANDONED for a published action. Every failure is an unprobed value,
 *  which the resolution reads as UNKNOWN — never as absent. */
export function probeIntentRefs(intent, repoDir) {
  const probes = {}
  let seq = 0
  for (const move of intent.moves ?? []) {
    seq += 1
    const name = move.ref.replace(/^refs\/heads\//, '')
    const snapshotRef = `refs/reconcile-probe/${process.pid}-${seq}`
    const fetched = git(['fetch', '-q', 'origin', `+${move.ref}:${snapshotRef}`], repoDir)
    if (!fetched.ok) {
      // The fetch refuses for an ABSENT ref and for a transient failure alike;
      // only ls-remote separates them. An affirmative empty listing means the
      // ref does not exist — no ancestor, no trailer. Anything else stays
      // unprobed, and unprobed resolves UNKNOWN.
      const listed = git(['ls-remote', 'origin', move.ref], repoDir)
      if (listed.ok && listed.out === '') {
        probes[move.ref] = { refAt: null, afterIsAncestor: null, trailerFound: false, name }
      }
      continue
    }
    try {
      const refAt = git(['rev-parse', snapshotRef], repoDir).out || null
      if (!refAt) continue
      // Exit 0 is yes, exit 1 is no, anything else is UNPROBED — the missing
      // after-oid object, a shallow history — and unprobed resolves UNKNOWN.
      const ancestry = git(['merge-base', '--is-ancestor', move.afterOid, snapshotRef], repoDir)
      const afterIsAncestor = ancestry.status === 0 ? true : ancestry.status === 1 ? false : null
      // --grep only PREFILTERS candidates — it matches anywhere in the
      // message. Each candidate is then verified by git's own trailer
      // parser: only an exact PUBLICATION_TRAILER_KEY value counts.
      const candidates = git(['log', '--fixed-strings', `--grep=${intent.publicationId}`, '--format=%H', snapshotRef], repoDir)
      let trailerFound = null
      if (!candidates.ok) trailerFound = null
      else if (candidates.out === '') trailerFound = false
      else {
        trailerFound = false
        for (const sha of candidates.out.split('\n').filter(Boolean)) {
          const trailers = git(['show', '-s', `--format=%(trailers:key=${PUBLICATION_TRAILER_KEY},valueonly)`, sha], repoDir)
          if (trailers.ok && trailers.out.split('\n').some((value) => value.trim() === intent.publicationId)) {
            trailerFound = true
            break
          }
        }
      }
      probes[move.ref] = { refAt, afterIsAncestor, trailerFound, name }
    } finally {
      git(['update-ref', '-d', snapshotRef], repoDir)
    }
  }
  return probes
}

/** Fetches the landing target once into a private snapshot ref and answers,
 *  per queried sha, whether the target's history CONTAINS it. true/false are
 *  verdicts from the snapshot; null means the target could not be probed, and
 *  the lane classifier fails closed on null. */
export function landingTargetProbe(repoDir) {
  const snapshotRef = `refs/reconcile-probe/${process.pid}-landing-target`
  const fetched = git(['fetch', '-q', 'origin', `+${LANDING_TARGET_REF}:${snapshotRef}`], repoDir)
  if (!fetched.ok) return { contains: () => null, release: () => {} }
  return {
    contains: (sha) => {
      if (!sha) return null
      // The fetch above brought the target's WHOLE reachable history, so a
      // commit the repository does not even hold now is affirmatively not in
      // the target — while any other probe failure stays null (unprobed).
      const known = git(['cat-file', '-e', `${sha}^{commit}`], repoDir)
      if (known.status === 1) return false
      if (known.status !== 0) return null
      const ancestry = git(['merge-base', '--is-ancestor', sha, snapshotRef], repoDir)
      return ancestry.status === 0 ? true : ancestry.status === 1 ? false : null
    },
    release: () => git(['update-ref', '-d', snapshotRef], repoDir),
  }
}

export function gatherEvidence({ repoDir = REPO_ROOT, batchId } = {}) {
  const resolved = resolve(repoDir)
  const store = openStateStore({ repoDir: resolved, batchId })
  const journal = readJournal(store)
  const snapshot = readSnapshot(store)
  const registry = registryVerdict({ journalVerdict: journal.verdict, snapshotVerdict: snapshot.verdict })
  const derived = deriveSnapshot(journal.entries, { batchId })

  const now = Date.now()
  // ONE target snapshot for every landed claim in this gathering — fetched
  // lazily so a batch with no landed lane never fetches it.
  let targetProbe = null
  const landedOnTargetFor = (sha) => {
    if (!targetProbe) targetProbe = landingTargetProbe(resolved)
    return targetProbe.contains(sha)
  }
  const lanes = derived.attempts.map((attempt) => {
    const context = attemptContext(journal.entries, attempt.attemptId)
    const dir = join(store.dir, 'attempts', attempt.attemptId)
    const paths = attemptPaths(dir)
    const lease = readJsonIfAny(paths.leasePath)?.lease ?? null
    const workerProbe = lease ? probeOf(lease.holder?.pid) : { live: false }
    const worktreeExists = context.worktree ? existsSync(context.worktree) : false
    const localSha = context.worktree && worktreeExists ? git(['rev-parse', 'HEAD'], context.worktree).out || null : null
    const remoteListed = context.branch ? git(['ls-remote', 'origin', `refs/heads/${context.branch}`], resolved) : { ok: false, unasked: true }
    const remoteSha = remoteListed.ok && remoteListed.out ? remoteListed.out.split(/\s+/)[0] : null
    // A FAILED listing (network, auth) is not an absent branch: the lane may
    // have diverged invisibly, so the classifier alerts instead of passing.
    const remoteProbeFailed = Boolean(context.branch) && !remoteListed.ok
    // ANCESTRY for a differing remote tip: contained in the local history means
    // "local ahead, a push interval away"; a commit the worktree does not even
    // hold is history this lane never produced — an affirmative divergence. An
    // errored probe stays null, which the core reads as unplaced, never as ok.
    let remoteInLocal = null
    if (worktreeExists && localSha && remoteSha && localSha !== remoteSha) {
      const known = git(['cat-file', '-e', `${remoteSha}^{commit}`], context.worktree)
      if (!known.ok) remoteInLocal = false
      else {
        const ancestry = git(['merge-base', '--is-ancestor', remoteSha, localSha], context.worktree)
        remoteInLocal = ancestry.status === 0 ? true : ancestry.status === 1 ? false : null
      }
    }
    const recordedSha = attempt.state?.lastPushedSha ?? null
    const reading = classifyLane({
      record: attempt,
      workerProbe,
      lease,
      heartbeatAt: mtimeOf(paths.heartbeatPath),
      worktreeExists,
      localSha,
      remoteSha,
      remoteInLocal,
      remoteProbeFailed,
      recordedSha,
      landedOnTarget: attempt.state?.state === 'landed' ? landedOnTargetFor(recordedSha) : null,
      now,
    })
    return { attemptId: attempt.attemptId, pointId: attempt.pointId, state: attempt.state?.state ?? null, ...context, ...reading }
  })
  targetProbe?.release()

  const record = readJsonIfAny(store.daemonRecordPath)
  const lock = readJsonIfAny(join(resolved, '.claude', 'batch-lock.json'))
  // The report carries the IDENTITY of the record it judged, so an apply can
  // refuse when a different record stands by then (a restart, a handover).
  const pair = {
    ...daemonPairResolution({ record, copy: lock?.daemon ?? null, probe: record ? probeOf(record.pid) : null }),
    record: record ? { pid: record.pid, pidStartedAt: record.pidStartedAt, generation: record.generation } : null,
  }

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
  const writeLock = (next) => {
    const tmp = `${lockPath}.tmp-${process.pid}`
    writeFileSync(tmp, `${JSON.stringify(next)}\n`)
    renameSync(tmp, lockPath)
  }
  // EVERY MUTATION IS A FENCED COMPARE-AND-SWAP, not a read-before-write:
  // it runs under the SAME `.reaping` mutex that serializes lock takeover,
  // and the report's reading is REVALIDATED inside that mutex. Outside it, a
  // takeover could replace the lock between the check and the rename — the
  // stale snapshot restoring the old owner, and any after-check would then
  // validate the overwrite itself. Inside it no takeover, no copy write and
  // no other apply can interleave, so what the revalidation reads is what
  // the rename replaces. The after-checks below remain as tripwires for a
  // writer that bypasses the mutex — a defect worth failing loudly on.
  const revalidateLock = () => {
    const lock = readJsonIfAny(lockPath)
    if (!lock || lock.sessionId !== sessionId) return { ok: false, did: 'only the current lock owner applies pair resolutions' }
    if (report.lock && lock.fence !== report.lock.fence) {
      return { ok: false, did: `refused: the lock moved (fence ${lock.fence}, the report saw ${report.lock.fence}); regather before applying` }
    }
    return { ok: true, lock }
  }
  const lockStands = (expectDaemonGeneration = undefined) => {
    const lock = readJsonIfAny(lockPath)
    if (!lock || lock.sessionId !== sessionId) return false
    if (expectDaemonGeneration === undefined) return lock.daemon === undefined
    return lock.daemon?.generation === expectDaemonGeneration
  }
  const underMutex = (fn) => {
    const held = withLockWriteMutex(lockPath, () => {
      reconcileProbe.onMutexEntered?.(lockPath)
      return fn()
    })
    return held.ok ? held.result : { ok: false, did: held.reason }
  }
  const { action } = report.pair
  if (action === 'none') return { ok: true, did: 'nothing to do' }
  if (action === 'refuse-and-alert') return { ok: false, did: 'refused: the pair is impossible by construction; an operator resolves this' }
  // FAIL CLOSED ON THE REGISTRY: a corrupt or truncated journal can OMIT a
  // live lane, so its lane list must not authorise any mutation — least of all
  // the release of a daemon record whose workers it may not show (M41).
  if (!report.registry?.ok || (report.quarantined?.length ?? 0) > 0) {
    return { ok: false, did: 'refused: the registry is corrupt or carries quarantined entries; evidence that may omit a live lane authorises nothing' }
  }
  if (action === 'clear-copy') {
    return underMutex(() => {
      const pre = revalidateLock()
      if (!pre.ok) return pre
      const next = { ...pre.lock }
      delete next.daemon
      writeLock(next)
      if (!lockStands()) return { ok: false, did: 'the lock moved while the copy was being cleared despite the mutex; a writer bypasses the mutex — investigate' }
      return { ok: true, did: 'cleared the orphaned copy' }
    })
  }
  if (action === 'write-copy-from-record') {
    return underMutex(() => {
      const pre = revalidateLock()
      if (!pre.ok) return pre
      const record = readJsonIfAny(store.daemonRecordPath)
      if (!record) return { ok: false, did: 'the record vanished under the resolution; rerun reconciliation' }
      if (report.pair.record && !(record.pid === report.pair.record.pid && record.generation === report.pair.record.generation)) {
        return { ok: false, did: 'a different daemon record stands now than the one the report judged; regather before applying' }
      }
      writeLock({ ...pre.lock, daemon: { pid: record.pid, pidStartedAt: record.pidStartedAt, generation: record.generation } })
      if (!lockStands(record.generation)) return { ok: false, did: 'the lock moved while the copy was being written despite the mutex; a writer bypasses the mutex — investigate' }
      return { ok: true, did: 'wrote the copy from the record' }
    })
  }
  // The cold-record family: workers first, record last — never while any lane
  // still reads running or stalled (a stalled lane IS a live process).
  return underMutex(() => {
    const pre = revalidateLock()
    if (!pre.ok) return pre
    // 'stalled' IS a live process — silent, but alive — so it blocks a release
    // exactly like 'running' does: only proven death or a terminal state frees.
    const live = report.lanes.filter((lane) => ['running', 'stalled'].includes(lane.reading))
    if (live.length) {
      return { ok: false, did: `refused: ${live.length} lane(s) still read running or stalled under a cold record; a live process is a contradiction to investigate, not to delete` }
    }
    // COMPARE-AND-DELETE under the mutex: every other deleter of a daemon
    // record is a reconciler holding this same mutex, and record creation is
    // an exclusive 'wx' — so between this identity check and the unlink,
    // nobody can delete-and-recreate a newer generation under the checked
    // name. The one deleter outside the mutex is a daemon releasing its OWN
    // record, and that daemon is a process this report proved dead — which is
    // exactly what the identity check re-verifies.
    const recordNow = readJsonIfAny(store.daemonRecordPath)
    if (recordNow) {
      const judged = report.pair.record
      const same = judged && recordNow.pid === judged.pid && recordNow.generation === judged.generation && recordNow.pidStartedAt === judged.pidStartedAt
      if (!same) return { ok: false, did: 'a different daemon record stands now than the one the report judged cold; regather before releasing' }
      try {
        unlinkSync(store.daemonRecordPath)
      } catch {
        /* already released — idempotence is the point */
      }
    }
    const after = readJsonIfAny(store.daemonRecordPath)
    if (after && report.pair.record && after.generation === report.pair.record.generation) {
      return { ok: false, did: 'the cold record survived its release; investigate before retrying' }
    }
    const next = { ...pre.lock }
    delete next.daemon
    writeLock(next)
    if (!lockStands()) return { ok: false, did: 'the lock moved while its copy was being cleared despite the mutex; a writer bypasses the mutex — investigate' }
    return { ok: true, did: 'released the cold record and cleared its copy; a new daemon mints a new generation' }
  })
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
  // GREEN MEANS RESOLVED, nothing less — the whole predicate lives in
  // reconcileExitRed (core) so it is testable: a pair action that REMAINS TO
  // BE DONE is red even without --apply, because "the daemon pair needs
  // resolution" is not resolved reconciliation.
  process.exit(reconcileExitRed(report) ? 1 : 0)
}
