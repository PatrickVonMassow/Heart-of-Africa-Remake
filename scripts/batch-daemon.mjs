#!/usr/bin/env node
// THE OS LAUNCHER DAEMON — step 3 of the "Ordered work" in
// docs/handover-architecture.md (work-order point 834, the front stage of 676;
// union M7). The daemon, not a session, is the parent and lifecycle owner of
// every handover-capable worker, so session exit cannot kill one; a session asks
// it over the control socket, presents (sessionId, fence), and the daemon
// re-reads the batch lock for every mutation (mechanism 2). All decisions live
// in the pure cores; this file is process, socket and file work.
//
//   node scripts/batch-daemon.mjs start  --repo <dir> --batch <id> --session <sid> [--drill]
//   node scripts/batch-daemon.mjs status --repo <dir> --batch <id>
//   node scripts/batch-daemon.mjs stop   --repo <dir> --batch <id> [--drain]
//   node scripts/batch-daemon.mjs drill --scenario parent-death   (see the drill file)
//
// PRODUCTION START IS INTERLOCKED: `start` without --drill consults the
// activation flag AND the step manifest, and both refuse while steps 8 and 9
// are not green (scripts/durable-lane-flag-core.mjs) — so today's authoring
// path is the path that runs. --drill starts a daemon ONLY against a sandbox
// repository outside this checkout; the refusal of a drill against the real
// repository is pinned by a test.
import { closeSync, chmodSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { createServer, createConnection } from 'node:net'
import { join, resolve, sep } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { probePid, processStartTime } from './batch-singleton.mjs'
import {
  attemptStateRecord,
  idempotencyKey,
  applyOnce,
  sameProcess,
  validateMutation,
  revalidateAfterWrite,
} from './batch-schema-core.mjs'
import { AGREEMENT_SILENCE_MS } from './batch-adoption-core.mjs'
import { appliedKeys, deriveSnapshot } from './batch-state-core.mjs'
import { appendJournalEntry, openStateStore, readJournal, writeSnapshot } from './batch-state.mjs'
import {
  DRAIN_STEPS,
  buildDaemonRecord,
  mayCreateDaemonRecord,
  mayStartAttempt,
  mintLaunchNonce,
  readinessSatisfied,
  workerSpawnPlan,
} from './batch-daemon-core.mjs'
import { grantAttemptLease, claimWorktree, releaseWorktree } from './batch-attempt-lease-core.mjs'
import { DURABLE_LANE_STEPS, mayStartDaemon } from './durable-lane-flag-core.mjs'
import { attemptPaths, readJsonIfAny, spawnDetached } from './detached-agent.mjs'

export const DAEMON_HEARTBEAT_MS = 1000
export const START_WAIT_MS = 10_000
export const CHECKPOINT_WAIT_MS = 60_000
/** How long adoption watches the worker's heartbeat for MOVEMENT (the worker
 *  ticks every few hundred ms; ten times that is observation, not luck). */
export const ADOPTION_PULSE_WAIT_MS = 5000
export const FLAG_PATH_SUFFIX = join('.claude', 'durable-lane-flag.json')

const nowMs = () => Date.now()
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

function lockPathFor(repoDir) {
  return join(repoDir, '.claude', 'batch-lock.json')
}
function fenceStorePathFor(repoDir) {
  return join(repoDir, '.claude', 'batch-fence.json')
}

function readLock(repoDir) {
  return readJsonIfAny(lockPathFor(repoDir))
}

/** The SYMLINK half of the one-worktree/one-attempt invariant: the pure claim
 *  key normalises lexically, but only realpath removes link aliases — two
 *  attempts naming `/wt/a` and a symlink to it must collide. A worktree that
 *  cannot be resolved does not exist and cannot be claimed. */
export function canonicalWorktree(worktree) {
  if (typeof worktree !== 'string' || !worktree.startsWith('/')) {
    return { ok: false, reason: 'a worktree is an absolute path' }
  }
  try {
    return { ok: true, path: realpathSync(worktree) }
  } catch (error) {
    return { ok: false, reason: `the worktree cannot be canonicalised (does it exist?): ${error.message}` }
  }
}

function probeOf(pid) {
  if (!Number.isInteger(pid) || pid < 1) return { live: false }
  const probe = probePid(pid)
  return { live: probe?.exists === true, pid, startedAt: probe?.startedAt ?? null }
}

/** realpath, or null: the interlock and canonical checks treat an
 *  unresolvable path as a refusal, never as a pass. */
function realOrNull(path) {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

/** Durable atomic replacement: tmp, fsync, rename — the pattern every file
 *  whose loss would un-fence a writer must use. */
function writeDurableSync(path, content) {
  const tmp = `${path}.tmp-${process.pid}`
  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeSync(fd, content)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
}

function mtimeOf(path) {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

/** Durable exclusive create: 'wx' so a second daemon cannot claim the record,
 *  fsynced so the readiness wait never reads a name with no bytes behind it. */
function writeRecordExclusive(path, record) {
  const fd = openSync(path, 'wx', 0o600)
  try {
    writeSync(fd, `${JSON.stringify(record)}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

// ---------------------------------------------------------------------------
// THE SERVING PROCESS
// ---------------------------------------------------------------------------

async function serve(args) {
  const repoDir = resolve(args.repo)
  // THE INTERLOCK IS ENFORCED HERE, in the serving process itself — not only in
  // startDaemon: `node scripts/batch-daemon.mjs serve ...` is reachable
  // directly, and a gate that lives only in the launcher is a gate a direct
  // dispatch walks around. startDaemon's copy of these checks is the early,
  // friendlier refusal; this one is the authoritative one.
  if (args.drill === true) {
    // REAL paths on both sides: a lexical prefix test passes an outside path
    // that is a symlink INTO this checkout, while every later write lands in
    // the real repository. A path that cannot be canonicalised fails closed.
    const root = realOrNull(resolve(REPO_ROOT))
    const repoReal = realOrNull(repoDir)
    if (!root || !repoReal || repoReal === root || repoReal.startsWith(root + sep)) {
      console.error('daemon: a drill daemon serves only a sandbox repository, never this checkout')
      process.exit(1)
    }
  } else {
    const gate = mayStartDaemon({ flag: readJsonIfAny(join(repoDir, FLAG_PATH_SUFFIX)), steps: DURABLE_LANE_STEPS })
    if (!gate.ok) {
      console.error(`daemon: ${gate.reason}`)
      process.exit(1)
    }
  }
  const store = openStateStore({ repoDir, batchId: args.batch })
  const fenceStore = readJsonIfAny(fenceStorePathFor(repoDir))
  if (!fenceStore || typeof fenceStore.generation !== 'string' || !fenceStore.generation || !Number.isInteger(fenceStore.fence)) {
    console.error('daemon: the fence store is missing its generation or fence; a batch that cannot prove who owns it must stop')
    process.exit(1)
  }
  const journal = readJournal(store)
  // A corrupt journal prohibits everything but status and alerting (mechanism 2):
  // recovery is an operator act, never an automatic one.
  const journalCorrupt = journal.verdict !== 'ok'
  const applied = appliedKeys(journal.entries)
  let seq = journal.entries.reduce((max, e) => Math.max(max, e.seq ?? 0), 0)
  const fence = fenceStore.fence
  // The NEWEST fence a validated mutation presented. A handover moves the lock
  // to a successor fence while this daemon keeps serving; everything it writes
  // afterwards — drain states, its own stop entry — must carry that fence, not
  // the one it happened to be started under.
  let currentFence = fence

  const identity = { pid: process.pid, pidStartedAt: processStartTime(process.pid) ?? nowMs() - process.uptime() * 1000 }
  const existing = readJsonIfAny(store.daemonRecordPath)
  const may = mayCreateDaemonRecord({ existing, probe: existing ? probeOf(existing.pid) : null })
  if (!may.ok) {
    // A cold record blocks a new daemon BY DESIGN: reconciliation (step 8)
    // releases it after reading what its workers left, never a fresh start.
    console.error(`daemon: ${may.reason}`)
    process.exit(1)
  }
  const built = buildDaemonRecord({
    ...identity,
    generation: fenceStore.generation,
    fence,
    launchNonce: args.nonce,
    startedAt: nowMs(),
  })
  if (!built.ok) {
    console.error(`daemon: ${built.reason}`)
    process.exit(1)
  }

  // A DURABLE-WRITE FAILURE FAILS CLOSED: an external effect with no journal
  // evidence is exactly what the store exists to prevent, so a refused append
  // is STICKY — the daemon refuses every further mutation like it does for a
  // corrupt journal, and the caller of the failing mutation gets a refusal,
  // never a sequence number over missing bytes.
  let journalFailed = null
  const journalEntry = (entry, underFence = currentFence) => {
    if (journalFailed) return { ok: false, reason: journalFailed }
    const next = seq + 1
    let res
    try {
      res = appendJournalEntry(store, { seq: next, fence: underFence, ...entry })
    } catch (error) {
      res = { ok: false, reason: error.message }
    }
    if (!res.ok) {
      journalFailed = `the journal refused an append: ${res.reason}`
      console.error(`daemon: ${journalFailed}; every further mutation is refused`)
      return { ok: false, reason: journalFailed }
    }
    seq = next
    return { ok: true, seq: next }
  }

  // The daemon is the journal's ONE writer, transitions included (mechanism 2):
  // a fence it has not journalled yet gets its transition appended BEFORE the
  // first entry written under it — at serve start for the fence it was started
  // under, and inside `mutate` when a handover moves the lock to a new one.
  // A fence is marked journalled only AFTER its append succeeded.
  const journalledFences = new Set(journal.entries.filter((e) => e.kind === 'fence-transition').map((e) => e.fence))
  const ensureFenceJournalled = (underFence) => {
    if (journalCorrupt) return { ok: false, reason: 'the journal is corrupt' }
    if (journalledFences.has(underFence)) return { ok: true }
    const res = journalEntry({ kind: 'fence-transition' }, underFence)
    if (res.ok) journalledFences.add(underFence)
    return res
  }

  // EXCLUSIVITY BEFORE THE FIRST JOURNAL WRITE: the 'wx' create is what makes
  // this process the journal's single writer, so nothing may be appended before
  // it. Two simultaneous starters both pass the advisory pre-check above; the
  // loser of this create exits here having written NOTHING.
  try {
    writeRecordExclusive(store.daemonRecordPath, built.record)
  } catch (error) {
    console.error(`daemon: could not claim the identity record exclusively (${error.code ?? error.message}); another daemon won the race`)
    process.exit(1)
  }
  if (!journalCorrupt) {
    const booted = ensureFenceJournalled(fence).ok && journalEntry({ kind: 'daemon-lifecycle', event: 'start', record: built.record }).ok
    if (!booted) {
      // A daemon that cannot journal its own start has no business existing:
      // release the record it just claimed and stop.
      try {
        unlinkSync(store.daemonRecordPath)
      } catch {
        /* the record may not have survived either; either way it is not ours to keep */
      }
      console.error('daemon: could not journal the start; refusing to serve')
      process.exit(1)
    }
  }

  const workers = new Map() // attemptId -> { attempt, pid, worktree, leaseId, dir }
  let leases = new Map() // attemptId -> lease
  let worktreeClaims = {}
  const attemptsState = new Map() // attemptId -> last attempt snapshot row
  let draining = false

  const heartbeat = setInterval(() => {
    writeFileSync(join(store.dir, 'daemon-heartbeat'), `${nowMs()}\n`)
  }, DAEMON_HEARTBEAT_MS)

  const recordAttemptState = (attemptId, pointId, record, underFence = currentFence) => {
    // Journal FIRST: an in-memory state the journal never accepted would let
    // the daemon act on evidence no successor can ever see.
    const logged = journalEntry({ kind: 'attempt-state', batchId: args.batch, pointId, attemptId, record }, underFence)
    if (logged.ok) attemptsState.set(attemptId, { batchId: args.batch, pointId, attemptId, state: record })
    return logged
  }

  /** One mutation, the whole mechanism-2 sequence: validate against the freshly
   *  read lock, apply once by idempotency key, journal under the fence, re-read
   *  the lock, compensate if it moved. */
  const mutate = async (request, applyFn, compensateFn) => {
    if (draining) return { ok: false, reason: 'the daemon is draining and refuses new mutations' }
    if (journalCorrupt) return { ok: false, reason: 'the journal is corrupt; the daemon refuses every mutation and awaits the operator' }
    if (journalFailed) return { ok: false, reason: `the journal failed durably (${journalFailed}); the daemon refuses every mutation and awaits the operator` }
    const lock = readLock(repoDir)
    const presented = { sessionId: request.sessionId, fence: request.fence }
    const validated = validateMutation({ presented, lock, probe: lock ? probeOf(lock.pid) : null, now: nowMs() })
    if (!validated.ok) return { ok: false, reason: validated.reason }
    currentFence = validated.fence
    // Every command's idempotency key includes the batch, so the payload must
    // name THIS batch — a request keyed for another one is not a retry here.
    if ((request.payload?.batchId ?? null) !== args.batch) {
      return { ok: false, reason: `the payload names batch ${String(request.payload?.batchId)}, this daemon serves ${args.batch}` }
    }
    const keyed = idempotencyKey(request.cmd, request.payload ?? {})
    if (!keyed.ok) return { ok: false, reason: keyed.reason }
    const application = applyOnce(applied, keyed.key, () => applyFn())
    if (!application.ok) return { ok: false, reason: application.reason }
    if (!application.applied) return { ok: true, alreadyApplied: true }
    // The key counts as applied only after the operation SUCCEEDED and its
    // journal entry stands (added below): a capacity refusal, a spawn failure
    // or a thrown operation never happened, and its key must not answer the
    // next legitimate retry with `alreadyApplied`. Restart agrees: appliedKeys
    // rebuilds from journalled commands, which only successes produce.
    let result
    try {
      result = await application.result
    } catch (error) {
      // An exception AFTER partial application is exactly what compensation
      // exists for: the operation may have installed claims or spawned a
      // worker before it threw, and returning without reversing them would
      // leave effects no journal entry accounts for.
      const compensated = compensateFn ? await compensateFn(null) : { note: 'no local effect to reverse' }
      return { ok: false, reason: `the operation failed before completing: ${error.message}; partial effects were compensated: ${JSON.stringify(compensated)}` }
    }
    if (result && result.ok === false) return result
    // The entry carries the fence it was VALIDATED under, which after a handover
    // is the successor's, not the fence this daemon was started under. A refused
    // append REVERSES the local effect and refuses the mutation: acknowledging
    // an effect the journal never recorded would leave the world ahead of every
    // durable trace of it.
    const fenceLogged = ensureFenceJournalled(validated.fence)
    const logged = fenceLogged.ok
      ? journalEntry({ kind: 'command', name: request.cmd, key: keyed.key, payload: request.payload ?? {} }, validated.fence)
      : fenceLogged
    if (!logged.ok) {
      const compensated = compensateFn ? await compensateFn(result) : { note: 'no local effect to reverse' }
      console.error(`daemon: ${request.cmd} reversed after a journal refusal: ${JSON.stringify(compensated)}`)
      return { ok: false, reason: `refused: the journal could not record ${request.cmd} (${logged.reason}); the local effect was reversed` }
    }
    applied.add(keyed.key)
    const after = revalidateAfterWrite({ validated: presented, lock: readLock(repoDir) })
    if (after.verdict === 'compensate') {
      const compensated = compensateFn ? await compensateFn(result) : { note: 'no local effect to reverse' }
      journalEntry({ kind: 'command', name: `${request.cmd}:compensated`, key: `${keyed.key}:comp`, payload: { reason: after.reason, ...compensated } }, validated.fence)
      return { ok: false, reason: `compensated: ${after.reason}` }
    }
    return { ok: true, result, fence: validated.fence }
  }

  const handlers = {
    status: () => ({
      ok: true,
      record: built.record,
      journalVerdict: journal.verdict,
      attempts: [...attemptsState.values()],
      workers: [...workers.keys()],
      draining,
    }),

    'start-attempt': (request) =>
      mutate(
        request,
        async () => {
          const { pointId, attemptId, branch, adapter } = request.payload ?? {}
          const cap = mayStartAttempt({ attempts: [...attemptsState.values()] })
          if (!cap.ok) return { ok: false, reason: cap.reason }
          // Realpath BEFORE claiming, so a symlink alias of a claimed worktree
          // collides with it instead of slipping past the raw-string key.
          const canonical = canonicalWorktree(request.payload?.worktree)
          if (!canonical.ok) return { ok: false, reason: canonical.reason }
          const worktree = canonical.path
          const leaseId = mintLaunchNonce()
          if (leases.get(attemptId)) return { ok: false, reason: `attempt ${attemptId} already holds a lease; a retry is a new attempt id` }
          const claimed = claimWorktree({ claims: worktreeClaims, worktree, attempt: { batchId: args.batch, pointId, attemptId } })
          if (!claimed.ok) return { ok: false, reason: claimed.reason }
          worktreeClaims = claimed.claims
          // Everything from the claim onward reverses ITSELF on any failure or
          // exception: a thrown mkdir or lease write must not strand the claim,
          // the lease entry or a spawned worker with no journal evidence.
          let spawnedWorker = null
          const reverse = async (why) => {
            if (spawnedWorker) await stopWorker(spawnedWorker, why)
            leases.delete(attemptId)
            workers.delete(attemptId)
            const released = releaseWorktree({ claims: worktreeClaims, worktree, attempt: { batchId: args.batch, pointId, attemptId } })
            if (released.ok) worktreeClaims = released.claims
          }
          try {
            const dir = join(store.dir, 'attempts', attemptId)
            mkdirSync(dir, { recursive: true, mode: 0o700 })
            const plan = workerSpawnPlan({ adapter, pointId, branch, worktree, attemptDir: dir, leaseId })
            if (!plan.ok) {
              await reverse('start-attempt refused after the claim')
              return { ok: false, reason: plan.reason }
            }
            const spawned = spawnDetached({ cmd: plan.cmd, args: plan.args, cwd: process.cwd(), logPath: plan.logPath })
            // The lease belongs to the WRITER (M39), which exists only now: grant it
            // to the worker's own pid and start time and hand it over through the
            // attempt directory. The worker waits for this file before its first
            // write, so absence-at-start is patience, not dispossession.
            const workerProbe = probeOf(spawned.pid)
            if (workerProbe.live !== true || !Number.isFinite(workerProbe.startedAt)) {
              await reverse('start-attempt failed at spawn')
              return { ok: false, reason: `the worker died at spawn (pid ${spawned.pid})` }
            }
            spawnedWorker = { pointId, pid: spawned.pid, pidStartedAt: workerProbe.startedAt, worktree, leaseId, dir }
            const granted = grantAttemptLease({
              existing: null,
              attempt: { batchId: args.batch, pointId, attemptId },
              holder: { pid: spawned.pid, pidStartedAt: workerProbe.startedAt },
              now: nowMs(),
              leaseId,
            })
            if (!granted.ok) {
              await reverse('start-attempt failed at the lease grant')
              return { ok: false, reason: granted.reason }
            }
            leases.set(attemptId, granted.lease)
            writeFileSync(attemptPaths(dir).leasePath, `${JSON.stringify({ lease: granted.lease })}\n`)
            workers.set(attemptId, spawnedWorker)
            const record = attemptStateRecord({ state: 'running', actor: 'daemon', fence: request.fence, at: nowMs(), lastCommit: null, lastPushedSha: null })
            if (record.ok) recordAttemptState(attemptId, pointId, record.record, request.fence)
            return { ok: true, attemptId, pid: spawned.pid, leaseId }
          } catch (error) {
            await reverse(`start-attempt threw: ${error.message}`)
            return { ok: false, reason: `start-attempt failed and its partial effects were reversed: ${error.message}` }
          }
        },
        async (result) => {
          // Compensation reverses EVERYTHING start-attempt installs — worker,
          // lease entry, worktree claim — and finds its attempt from the
          // payload when the operation threw before producing a result.
          const attemptId = result?.attemptId ?? request.payload?.attemptId
          const worker = workers.get(attemptId)
          if (worker) {
            await stopWorker(worker, 'compensation: the lock moved under start-attempt')
            const released = releaseWorktree({ claims: worktreeClaims, worktree: worker.worktree, attempt: { batchId: args.batch, pointId: worker.pointId, attemptId } })
            if (released.ok) worktreeClaims = released.claims
          }
          leases.delete(attemptId)
          workers.delete(attemptId)
          return { compensation: 'stop-worker-preserve-branch-release-claim' }
        },
      ),

    'request-checkpoint': (request) =>
      mutate(request, async () => {
        const requestId = request.payload?.requestId
        const waitMs = Number(request.payload?.waitMs) > 0 ? Number(request.payload.waitMs) : CHECKPOINT_WAIT_MS
        const asked = [...workers.entries()].map(([attemptId, worker]) => {
          writeFileSync(attemptPaths(worker.dir).checkpointRequestPath, `${JSON.stringify({ requestId, at: nowMs() })}\n`)
          return { attemptId, worker }
        })
        const deadline = nowMs() + waitMs
        const answers = []
        for (const { attemptId, worker } of asked) {
          let ack = null
          for (;;) {
            ack = readJsonIfAny(attemptPaths(worker.dir).checkpointAckPath)
            if (ack?.requestId === requestId || nowMs() > deadline) break
            await sleep(100)
          }
          if (ack?.requestId !== requestId) {
            // M20: a worker that cannot checkpoint in the bounded interval is
            // named non-transferable; the caller chooses wait, cancel or drain.
            answers.push({ attemptId, acknowledged: false, transferable: false, choices: ['wait', 'cancel', 'drain'] })
            continue
          }
          const clean = ack.pushedOk === true && ack.dirty === false
          answers.push({ attemptId, acknowledged: true, transferable: clean, sha: ack.sha ?? null, dirty: ack.dirty === true, pushedOk: ack.pushedOk === true })
        }
        return { ok: true, requestId, answers }
      }),

    'cancel-attempt': (request) =>
      mutate(request, async () => {
        const { attemptId, reason } = request.payload ?? {}
        const worker = workers.get(attemptId)
        if (!worker) return { ok: false, reason: `no such worker: ${attemptId}` }
        const stop = await stopWorker(worker, reason)
        if (!stop.stopped) {
          // FAIL CLOSED: the revoked on-disk lease fences the survivor from
          // pushing, but claim, lease record and worker entry stay held —
          // releasing a worktree a live process may still write would license
          // a second writer beside it.
          return {
            ok: false,
            reason: `worker pid ${worker.pid} did not die on cancellation; its lease is revoked and nothing is released — investigate before retrying`,
          }
        }
        const status = readJsonIfAny(attemptPaths(worker.dir).statusPath)
        const record = attemptStateRecord({
          state: 'cancelled',
          reason: String(reason || 'cancelled'),
          actor: request.sessionId,
          fence: request.fence,
          at: nowMs(),
          lastCommit: status?.sha ?? null,
          lastPushedSha: status?.sha ?? null,
        })
        if (record.ok) recordAttemptState(attemptId, worker.pointId, record.record, request.fence)
        const released = releaseWorktree({ claims: worktreeClaims, worktree: worker.worktree, attempt: { batchId: args.batch, pointId: worker.pointId, attemptId } })
        if (released.ok) worktreeClaims = released.claims
        leases.delete(attemptId)
        workers.delete(attemptId)
        return { ok: true, attemptId, branchPreserved: true, lastPushedSha: status?.sha ?? null }
      }),

    'adopt-attempt': (request) =>
      mutate(request, async () => {
        const { attemptId } = request.payload ?? {}
        const known = attemptsState.get(attemptId)
        if (!known) return { ok: false, reason: `no such attempt: ${attemptId}` }
        // Adoption is an OPERATION against verified evidence, never a reading
        // of the in-memory map (M17/M18): the successor takes over supervision
        // only of a worker whose lease stands on disk AND in memory and is
        // UNEXPIRED, whose recorded process identity probes live, and whose
        // heartbeat is observed to ADVANCE — one fresh timestamp is a
        // snapshot, not a pulse, and a worker frozen just before it would
        // pass. Everything else — dead holder, revoked or expired lease,
        // silent or frozen heartbeat — is reconciliation's case (step 8),
        // not adoption's.
        const worker = workers.get(attemptId)
        if (!worker) {
          return { ok: false, reason: `attempt ${attemptId} has no live worker under this daemon; reconcile it (step 8) instead of adopting` }
        }
        const lease = leases.get(attemptId)
        const onDisk = readJsonIfAny(attemptPaths(worker.dir).leasePath)?.lease ?? null
        if (!lease || !onDisk || onDisk.leaseId !== lease.leaseId) {
          return { ok: false, reason: `attempt ${attemptId} carries no standing lease; a revoked or missing lease is reconciled, not adopted` }
        }
        if (!Number.isFinite(lease.expiresAt) || nowMs() > lease.expiresAt) {
          return { ok: false, reason: `the lease of ${attemptId} is expired or carries no expiry; an expired lease alerts and is reconciled, never adopted (M38)` }
        }
        const probe = probeOf(lease.holder?.pid)
        if (probe.live !== true || !sameProcess(lease.holder, { pid: probe.pid, pidStartedAt: probe.startedAt })) {
          return { ok: false, reason: `the lease holder of ${attemptId} does not probe live under its recorded identity; nothing that cannot answer is adopted` }
        }
        const heartbeatPath = attemptPaths(worker.dir).heartbeatPath
        const first = mtimeOf(heartbeatPath)
        if (!Number.isFinite(first) || nowMs() - first > AGREEMENT_SILENCE_MS) {
          return { ok: false, reason: `the worker of ${attemptId} has a missing or silent heartbeat; a stalled lane is reconciled, not adopted` }
        }
        let advanced = false
        const pulseDeadline = nowMs() + ADOPTION_PULSE_WAIT_MS
        while (nowMs() < pulseDeadline) {
          await sleep(200)
          const again = mtimeOf(heartbeatPath)
          if (Number.isFinite(again) && again > first) {
            advanced = true
            break
          }
        }
        if (!advanced) {
          return { ok: false, reason: `the heartbeat of ${attemptId} did not advance within ${ADOPTION_PULSE_WAIT_MS}ms; a frozen worker is reconciled, not adopted` }
        }
        return {
          ok: true,
          attemptId,
          adoptedBy: request.sessionId,
          fence: request.fence,
          worker: { pid: lease.holder.pid, pidStartedAt: lease.holder.pidStartedAt, leaseId: lease.leaseId },
        }
      }),

    'record-state': (request) =>
      mutate(request, () => {
        const p = request.payload ?? {}
        const checked = attemptStateRecord({
          state: p.state,
          reason: p.reason,
          actor: p.actor ?? request.sessionId,
          fence: request.fence,
          at: p.at,
          lastCommit: p.lastCommit ?? null,
          lastPushedSha: p.lastPushedSha ?? null,
        })
        if (!checked.ok) return { ok: false, reason: checked.reason }
        recordAttemptState(p.attemptId, p.pointId, checked.record, request.fence)
        return { ok: true }
      }),

    shutdown: (request) => {
      // Shutdown drains workers and releases the identity record — a mutation
      // like any other, so it is fenced like any other: batch identity, the
      // freshly read lock, (sessionId, fence), owner liveness and lease
      // freshness. A stale session cannot drain a daemon it no longer owns.
      // The way out of a daemon whose journal is corrupt is the OS's, not the
      // socket's: SIGTERM from the record's owner.
      if (journalCorrupt) {
        return { ok: false, reason: 'the journal is corrupt; socket shutdown is refused — stop the daemon by SIGTERM and reconcile (step 8)' }
      }
      if ((request.payload?.batchId ?? null) !== args.batch) {
        return { ok: false, reason: `the payload names batch ${String(request.payload?.batchId)}, this daemon serves ${args.batch}` }
      }
      const lock = readLock(repoDir)
      const validated = validateMutation({
        presented: { sessionId: request.sessionId, fence: request.fence },
        lock,
        probe: lock ? probeOf(lock.pid) : null,
        now: nowMs(),
      })
      if (!validated.ok) return { ok: false, reason: validated.reason }
      const drain = request.payload?.drain === true
      // The credentials ride along: performShutdown validates them AGAIN when
      // the timer fires, because this validation is stale by then.
      setTimeout(() => performShutdown(drain, { presented: { sessionId: request.sessionId, fence: request.fence } }), 20)
      return { ok: true, draining: drain, steps: DRAIN_STEPS }
    },
  }

  /** Gone for WRITING purposes: dead, a RECYCLED pid — the number lives but its
   *  start time is not the worker's, so the worker itself is gone and the
   *  stranger must not be signalled — or a zombie, which holds its pid but no
   *  thread that could touch the worktree again. */
  function workerGone(worker) {
    const probe = probeOf(worker.pid)
    if (probe.live !== true) return true
    if (!sameProcess({ pid: worker.pid, pidStartedAt: worker.pidStartedAt }, { pid: probe.pid, pidStartedAt: probe.startedAt })) return true
    try {
      const stat = readFileSync(`/proc/${worker.pid}/stat`, 'utf8')
      return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) === 'Z'
    } catch {
      return true
    }
  }

  /** Stops a worker FAIL-CLOSED. The on-disk lease is revoked FIRST — durably,
   *  by tmp-fsync-rename, because a revocation that can be lost in a crash is
   *  no fence — so every later push is fenced even if the process resists its
   *  signals; then the process group gets SIGTERM, a bounded grace, SIGKILL.
   *  Every signal is IDENTITY-CHECKED at send time: once the worker's recorded
   *  pid start time no longer matches, the number belongs to a stranger and is
   *  never signalled (group ids included — the group id is the leader's pid).
   *  The verdict is the identity probe, never the status file alone; and a
   *  revocation that could not be persisted is reported, because a caller that
   *  releases state over it would leave a live worker holding a valid lease. */
  async function stopWorker(worker, why) {
    const paths = attemptPaths(worker.dir)
    let revoked = true
    try {
      writeDurableSync(paths.leasePath, `${JSON.stringify({ lease: null, revokedAt: nowMs(), reason: String(why || 'stopped') })}\n`)
    } catch (error) {
      revoked = false
      console.error(`daemon: could not revoke the on-disk lease for pid ${worker.pid}: ${error.message}`)
    }
    const signalGroup = (signal) => {
      if (workerGone(worker)) return
      try {
        process.kill(-worker.pid, signal)
      } catch {
        try {
          process.kill(worker.pid, signal)
        } catch {
          /* already gone; the branch is preserved either way */
        }
      }
    }
    const goneWithin = async (ms) => {
      const deadline = nowMs() + ms
      while (nowMs() < deadline) {
        if (workerGone(worker)) return true
        await sleep(100)
      }
      return workerGone(worker)
    }
    signalGroup('SIGTERM')
    if (await goneWithin(5000)) return { stopped: true, revoked }
    signalGroup('SIGKILL')
    if (await goneWithin(2000)) return { stopped: true, escalated: true, revoked }
    console.error(`daemon: worker pid ${worker.pid} survived SIGTERM and SIGKILL (${why}); its lease is revoked but nothing is released`)
    return { stopped: false, revoked }
  }

  async function performShutdown(drain, { presented = null } = {}) {
    if (draining) return
    // The socket handler's validation is STALE BY NOW — it aged across the
    // reply timer, and a successor can have acquired the lock since. A
    // credential-carrying shutdown re-validates at the moment it ACTS; a
    // request whose authority lapsed in between does nothing. The SIGTERM
    // path carries no credentials: the signal itself is the record owner's
    // authority.
    if (presented) {
      const lock = readLock(repoDir)
      const validated = validateMutation({ presented, lock, probe: lock ? probeOf(lock.pid) : null, now: nowMs() })
      if (!validated.ok) {
        console.error(`daemon: shutdown aborted at execution time: ${validated.reason}`)
        return
      }
      currentFence = validated.fence
    }
    draining = true
    if (!journalCorrupt) ensureFenceJournalled(currentFence)
    // Any worker this shutdown leaves behind — an undrained live worker, one
    // that survived its signals, or one whose lease revocation could not be
    // persisted — keeps a claim only the daemon's maps knew. Releasing the
    // identity record over that claim would let a fresh daemon re-issue the
    // same worktree beside a live writer, so the record is released ONLY when
    // nothing survives it; otherwise it stays as the cold record that forces
    // reconciliation (step 8) before any successor daemon.
    let unreleased = 0
    if (drain) {
      for (const [attemptId, worker] of workers) {
        const stop = await stopWorker(worker, 'daemon drain')
        if (!stop.stopped || stop.revoked === false) {
          // The survivor is fenced by its revoked lease (when that write
          // stood); its state stays exactly as recorded, for reconciliation
          // to read — a drain must not journal 'cancelled' over a process
          // that may still be alive.
          unreleased += 1
          console.error(`daemon: drain leaves worker pid ${worker.pid} unreleased (stopped: ${stop.stopped}, lease revoked: ${stop.revoked}); reconcile it (step 8)`)
          continue
        }
        const status = readJsonIfAny(attemptPaths(worker.dir).statusPath)
        const record = attemptStateRecord({
          state: 'cancelled',
          reason: 'daemon drain',
          actor: 'daemon',
          fence: currentFence,
          at: nowMs(),
          lastCommit: status?.sha ?? null,
          lastPushedSha: status?.sha ?? null,
        })
        if (record.ok && !journalCorrupt) recordAttemptState(attemptId, worker.pointId, record.record)
      }
      if (!journalCorrupt) {
        writeSnapshot(store, { ...deriveSnapshot(readJournal(store).entries, { batchId: args.batch }), sealed: true, sealedAt: nowMs() })
      }
    } else {
      // A non-draining shutdown deliberately leaves its workers running —
      // they are durable — but their claims must survive the daemon: every
      // live worker counts as unreleased so the record stays for adoption or
      // reconciliation.
      unreleased = workers.size
    }
    if (!journalCorrupt) journalEntry({ kind: 'daemon-lifecycle', event: 'stop', drained: drain, unreleased })
    clearInterval(heartbeat)
    try {
      server.close()
    } catch {
      /* closing is the goal */
    }
    if (unreleased === 0) {
      try {
        unlinkSync(store.daemonRecordPath)
      } catch {
        /* releasing a record that is already gone is release all the same */
      }
    } else {
      console.error(`daemon: ${unreleased} worker(s) survive this shutdown; the identity record stays as a cold record until reconciliation (step 8) releases it`)
    }
    process.exit(0)
  }

  const socketPath = join(store.dir, 'control.sock')
  if (existsSync(socketPath)) unlinkSync(socketPath) // ours by the exclusive record above
  let queue = Promise.resolve()
  const server = createServer((connection) => {
    let buffered = ''
    connection.on('data', (chunk) => {
      buffered += chunk
      const nl = buffered.indexOf('\n')
      if (nl < 0) return
      const line = buffered.slice(0, nl)
      buffered = buffered.slice(nl + 1)
      // ONE request per connection, SERIALIZED against every other: the daemon's
      // read-and-decide per mutation is one operation (mechanism 2).
      queue = queue.then(async () => {
        let reply
        try {
          const request = JSON.parse(line)
          // Own properties only: a bare index would answer 'constructor' or
          // 'toString' with inherited functions instead of a refusal.
          const handler = typeof request?.cmd === 'string' && Object.hasOwn(handlers, request.cmd) ? handlers[request.cmd] : null
          reply = handler ? await handler(request) : { ok: false, reason: `unknown command: ${String(request?.cmd)}` }
        } catch (error) {
          reply = { ok: false, reason: `unreadable request: ${error.message}` }
        }
        try {
          connection.end(`${JSON.stringify(reply)}\n`)
        } catch {
          /* the asker went away; the journal already has the truth */
        }
      })
    })
    connection.on('error', () => {})
  })
  server.listen(socketPath, () => chmodSync(socketPath, 0o600))
  process.on('SIGTERM', () => performShutdown(true))
}

// ---------------------------------------------------------------------------
// THE CLIENT SIDE
// ---------------------------------------------------------------------------

export function controlRequest({ repoDir, batchId, request, timeoutMs = 15_000 }) {
  const store = openStateStore({ repoDir, batchId })
  const socketPath = join(store.dir, 'control.sock')
  return new Promise((resolvePromise) => {
    const connection = createConnection(socketPath)
    let buffered = ''
    const timer = setTimeout(() => {
      connection.destroy()
      resolvePromise({ ok: false, reason: `the daemon did not answer within ${timeoutMs}ms` })
    }, timeoutMs)
    connection.on('connect', () => connection.write(`${JSON.stringify(request)}\n`))
    connection.on('data', (chunk) => {
      buffered += chunk
      const nl = buffered.indexOf('\n')
      if (nl < 0) return
      clearTimeout(timer)
      connection.destroy()
      try {
        resolvePromise(JSON.parse(buffered.slice(0, nl)))
      } catch (error) {
        resolvePromise({ ok: false, reason: `unreadable reply: ${error.message}` })
      }
    })
    connection.on('error', (error) => {
      clearTimeout(timer)
      resolvePromise({ ok: false, reason: `no control socket: ${error.message}` })
    })
  })
}

/** Starts the serving process with mechanism 1's escape and waits for the record
 *  carrying THIS launch's nonce. Exported for the drill and the tests. */
export async function startDaemon({ repoDir, batchId, drill = false, waitMs = START_WAIT_MS }) {
  const resolved = resolve(repoDir)
  if (drill) {
    // Same rule as the serving process: REAL paths on both sides, so a symlink
    // into this checkout cannot pass the prefix test, and an unresolvable path
    // fails closed.
    const root = realOrNull(resolve(REPO_ROOT))
    const repoReal = realOrNull(resolved)
    if (!root || !repoReal || repoReal === root || repoReal.startsWith(root + sep)) {
      return { ok: false, reason: 'a drill daemon runs only a sandbox repository, never this checkout (real paths compared; unresolvable refuses)' }
    }
  } else {
    const flag = readJsonIfAny(join(resolved, FLAG_PATH_SUFFIX))
    const gate = mayStartDaemon({ flag, steps: DURABLE_LANE_STEPS })
    if (!gate.ok) return { ok: false, reason: gate.reason }
  }
  const store = openStateStore({ repoDir: resolved, batchId })
  const nonce = mintLaunchNonce()
  spawnDetached({
    cmd: process.execPath,
    args: ['scripts/batch-daemon.mjs', 'serve', '--repo', resolved, '--batch', batchId, '--nonce', nonce, ...(drill ? ['--drill'] : [])],
    cwd: process.cwd(),
    logPath: join(store.dir, 'daemon.log'),
  })
  const deadline = nowMs() + waitMs
  for (;;) {
    const record = readJsonIfAny(store.daemonRecordPath)
    const ready = readinessSatisfied({ record, expectedNonce: nonce })
    if (ready.ok) return { ok: true, record }
    if (nowMs() > deadline) {
      const log = (() => {
        try {
          return readFileSync(join(store.dir, 'daemon.log'), 'utf8').slice(-2000)
        } catch {
          return ''
        }
      })()
      return { ok: false, reason: `no readiness record with this launch's nonce within ${waitMs}ms (${ready.reason})`, log }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
}

/** Writes the daemon COPY into the batch lock, from the record, for the current
 *  owner (mechanism 2: START writes the record first; the lock owner then reads
 *  it and writes the copy).
 *
 *  This is a COMPARE-AND-SWAP, not a replacement: a bare read-check-rename
 *  would let a writer that validated ownership, stalled, and woke after a
 *  handover rename its stale snapshot over the successor's lock — the old
 *  owner and fence restored by the very file that dispossessed them. So the
 *  update runs under a short-lived exclusive-create mutex beside the lock,
 *  and the ownership check is REPEATED inside it: only what the lock says at
 *  the instant of the swap decides, and a stale writer installs nothing. */
export function writeLockCopy({ repoDir, record, sessionId, fence = null, mutexWaitMs = 2000 }) {
  const path = lockPathFor(repoDir)
  const mutexDir = `${path}.copy-mutex`
  const staleMutexMs = 10_000
  const deadline = nowMs() + mutexWaitMs
  for (;;) {
    try {
      mkdirSync(mutexDir)
      break
    } catch {
      // A mutex left by a crashed holder must not refuse forever: the critical
      // section is a read and a rename, so a directory older than seconds is a
      // corpse and is reaped — the same shape as the lock's own reap mutex.
      try {
        if (nowMs() - statSync(mutexDir).mtimeMs > staleMutexMs) rmdirSync(mutexDir)
      } catch {
        /* raced another reaper or reader; the retry below decides */
      }
      if (nowMs() > deadline) return { ok: false, reason: 'the lock-copy mutex is held; another writer is mid-swap — retry or reconcile' }
      // A synchronous, bounded spin: contention is measured in milliseconds.
    }
  }
  try {
    const lock = readJsonIfAny(path)
    if (!lock || lock.sessionId !== sessionId) return { ok: false, reason: 'only the lock owner writes the daemon copy' }
    if (fence !== null && lock.fence !== fence) {
      return { ok: false, reason: `the lock carries fence ${lock.fence}, not the writer's ${fence}; a superseded owner writes nothing` }
    }
    const next = { ...lock, daemon: { pid: record.pid, pidStartedAt: record.pidStartedAt, generation: record.generation } }
    const tmp = `${path}.tmp-${process.pid}`
    writeFileSync(tmp, `${JSON.stringify(next)}\n`)
    renameSync(tmp, path)
    return { ok: true }
  } finally {
    try {
      rmdirSync(mutexDir)
    } catch {
      /* the mutex directory is best-effort cleanup; a leftover one times out above */
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: argv[0] }
  for (let i = 1; i < argv.length; i += 1) {
    const flag = argv[i]
    if (!flag.startsWith('--')) continue
    const bare = ['--drill', '--drain', '--keep']
    if (bare.includes(flag)) args[flag.slice(2)] = true
    else {
      args[flag.slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repoDir = resolve(args.repo ?? REPO_ROOT)
  if (args._ === 'serve') return serve({ ...args, repo: repoDir })
  if (args._ === 'start') {
    const started = await startDaemon({ repoDir, batchId: args.batch, drill: args.drill === true })
    if (!started.ok) {
      console.error(`start refused: ${started.reason}`)
      process.exit(1)
    }
    if (args.session) {
      const copied = writeLockCopy({ repoDir, record: started.record, sessionId: args.session })
      if (!copied.ok) console.error(`lock copy not written: ${copied.reason}`)
    }
    console.log(JSON.stringify({ ok: true, record: started.record }))
    return
  }
  if (args._ === 'status') {
    const reply = await controlRequest({ repoDir, batchId: args.batch, request: { cmd: 'status' }, timeoutMs: 3000 })
    console.log(JSON.stringify(reply))
    process.exit(reply.ok ? 0 : 1)
  }
  if (args._ === 'stop') {
    const store = openStateStore({ repoDir, batchId: args.batch })
    const record = readJsonIfAny(store.daemonRecordPath)
    if (!record) {
      console.log('no daemon record; nothing to stop')
      return
    }
    const probe = probeOf(record.pid)
    if (!(probe.live && Math.abs((probe.startedAt ?? 0) - record.pidStartedAt) <= 2000)) {
      console.error('the record is cold; reconcile it (step 8) rather than stopping a stranger')
      process.exit(1)
    }
    // Shutdown is a fenced mutation: the caller presents its OWN session and
    // fence, and the daemon validates them against the freshly read lock.
    const fence = Number(args.fence)
    if (!args.session || !Number.isInteger(fence)) {
      console.error('stop is a fenced mutation: --session <sid> and --fence <n> are required')
      process.exit(2)
    }
    const reply = await controlRequest({
      repoDir,
      batchId: args.batch,
      request: { cmd: 'shutdown', sessionId: args.session, fence, payload: { batchId: args.batch, drain: args.drain === true } },
    })
    console.log(JSON.stringify(reply))
    process.exit(reply.ok ? 0 : 1)
  }
  if (args._ === 'drill') {
    const { runDrill } = await import('./batch-daemon-drill.mjs')
    const result = await runDrill({ scenario: args.scenario, keep: args.keep === true })
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }
  console.error('usage: node scripts/batch-daemon.mjs start|status|stop|drill --repo <dir> --batch <id> [--session <sid>] [--fence <n>] [--drill] [--drain] [--scenario <name>]')
  process.exit(2)
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || String(error))
    process.exit(1)
  })
}
