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
import { closeSync, chmodSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { createServer, createConnection } from 'node:net'
import { join, resolve, sep } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { probePid, processStartTime } from './batch-singleton.mjs'
import {
  attemptStateRecord,
  idempotencyKey,
  applyOnce,
  validateMutation,
  revalidateAfterWrite,
} from './batch-schema-core.mjs'
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
    const root = resolve(REPO_ROOT)
    if (repoDir === root || repoDir.startsWith(root + sep)) {
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
  const journalEntry = (entry, underFence = fence) => {
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

  writeRecordExclusive(store.daemonRecordPath, built.record)
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

  const recordAttemptState = (attemptId, pointId, record, underFence = fence) => {
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
    applied.add(keyed.key)
    const result = await application.result
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
        () => {
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
          const dir = join(store.dir, 'attempts', attemptId)
          mkdirSync(dir, { recursive: true, mode: 0o700 })
          const plan = workerSpawnPlan({ adapter, pointId, branch, worktree, attemptDir: dir, leaseId })
          if (!plan.ok) return { ok: false, reason: plan.reason }
          worktreeClaims = claimed.claims
          const spawned = spawnDetached({ cmd: plan.cmd, args: plan.args, cwd: process.cwd(), logPath: plan.logPath })
          // The lease belongs to the WRITER (M39), which exists only now: grant it
          // to the worker's own pid and start time and hand it over through the
          // attempt directory. The worker waits for this file before its first
          // write, so absence-at-start is patience, not dispossession.
          const workerProbe = probeOf(spawned.pid)
          if (workerProbe.live !== true || !Number.isFinite(workerProbe.startedAt)) {
            const released = releaseWorktree({ claims: worktreeClaims, worktree, attempt: { batchId: args.batch, pointId, attemptId } })
            if (released.ok) worktreeClaims = released.claims
            return { ok: false, reason: `the worker died at spawn (pid ${spawned.pid})` }
          }
          const granted = grantAttemptLease({
            existing: null,
            attempt: { batchId: args.batch, pointId, attemptId },
            holder: { pid: spawned.pid, pidStartedAt: workerProbe.startedAt },
            now: nowMs(),
            leaseId,
          })
          if (!granted.ok) return { ok: false, reason: granted.reason }
          leases.set(attemptId, granted.lease)
          writeFileSync(attemptPaths(dir).leasePath, `${JSON.stringify({ lease: granted.lease })}\n`)
          workers.set(attemptId, { pointId, pid: spawned.pid, worktree, leaseId, dir })
          const record = attemptStateRecord({ state: 'running', actor: 'daemon', fence: request.fence, at: nowMs(), lastCommit: null, lastPushedSha: null })
          if (record.ok) recordAttemptState(attemptId, pointId, record.record, request.fence)
          return { ok: true, attemptId, pid: spawned.pid, leaseId }
        },
        async (result) => {
          const worker = workers.get(result?.attemptId)
          if (worker) await stopWorker(worker, 'compensation: the lock moved under start-attempt')
          return { compensation: 'stop-worker-preserve-branch' }
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
      mutate(request, () => {
        const { attemptId } = request.payload ?? {}
        const known = attemptsState.get(attemptId)
        if (!known) return { ok: false, reason: `no such attempt: ${attemptId}` }
        return { ok: true, attemptId, adoptedBy: request.sessionId, fence: request.fence, worker: workers.has(attemptId) ? workers.get(attemptId).pid : null }
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
      setTimeout(() => performShutdown(drain), 20)
      return { ok: true, draining: drain, steps: DRAIN_STEPS }
    },
  }

  /** Gone for WRITING purposes: dead, or a zombie — a zombie holds its pid but
   *  no thread that could touch the worktree again. */
  function workerGone(pid) {
    if (probeOf(pid).live !== true) return true
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
      return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) === 'Z'
    } catch {
      return true
    }
  }

  /** Stops a worker FAIL-CLOSED. The on-disk lease is revoked FIRST, so every
   *  later push is fenced even if the process resists its signals; then the
   *  process group gets SIGTERM, a bounded grace, SIGKILL — and the verdict is
   *  the PID PROBE, never the status file alone: a worker that still probes
   *  live was NOT stopped, and the caller must not release what it may still
   *  be writing. */
  async function stopWorker(worker, why) {
    const paths = attemptPaths(worker.dir)
    try {
      writeFileSync(paths.leasePath, `${JSON.stringify({ lease: null, revokedAt: nowMs(), reason: String(why || 'stopped') })}\n`)
    } catch (error) {
      console.error(`daemon: could not revoke the on-disk lease for pid ${worker.pid}: ${error.message}`)
    }
    const signalGroup = (signal) => {
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
        if (workerGone(worker.pid)) return true
        await sleep(100)
      }
      return workerGone(worker.pid)
    }
    signalGroup('SIGTERM')
    if (await goneWithin(5000)) return { stopped: true }
    signalGroup('SIGKILL')
    if (await goneWithin(2000)) return { stopped: true, escalated: true }
    console.error(`daemon: worker pid ${worker.pid} survived SIGTERM and SIGKILL (${why}); its lease is revoked but nothing is released`)
    return { stopped: false }
  }

  async function performShutdown(drain) {
    draining = true
    if (drain) {
      for (const [attemptId, worker] of workers) {
        const stop = await stopWorker(worker, 'daemon drain')
        if (!stop.stopped) {
          // The survivor is fenced by its revoked lease; its state stays
          // exactly as recorded, for reconciliation to read — a drain must not
          // journal 'cancelled' over a process that is still alive.
          console.error(`daemon: drain leaves worker pid ${worker.pid} unreleased; reconcile it (step 8)`)
          continue
        }
        const status = readJsonIfAny(attemptPaths(worker.dir).statusPath)
        const record = attemptStateRecord({
          state: 'cancelled',
          reason: 'daemon drain',
          actor: 'daemon',
          fence,
          at: nowMs(),
          lastCommit: status?.sha ?? null,
          lastPushedSha: status?.sha ?? null,
        })
        if (record.ok && !journalCorrupt) recordAttemptState(attemptId, worker.pointId, record.record)
      }
      if (!journalCorrupt) {
        writeSnapshot(store, { ...deriveSnapshot(readJournal(store).entries, { batchId: args.batch }), sealed: true, sealedAt: nowMs() })
      }
    }
    if (!journalCorrupt) journalEntry({ kind: 'daemon-lifecycle', event: 'stop', drained: drain })
    clearInterval(heartbeat)
    try {
      server.close()
    } catch {
      /* closing is the goal */
    }
    try {
      unlinkSync(store.daemonRecordPath)
    } catch {
      /* releasing a record that is already gone is release all the same */
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
          const handler = handlers[request?.cmd]
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
    const root = resolve(REPO_ROOT)
    if (resolved === root || resolved.startsWith(root + sep)) {
      return { ok: false, reason: 'a drill daemon runs only against a sandbox repository, never this checkout' }
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
 *  it and writes the copy). */
export function writeLockCopy({ repoDir, record, sessionId }) {
  const path = lockPathFor(repoDir)
  const lock = readJsonIfAny(path)
  if (!lock || lock.sessionId !== sessionId) return { ok: false, reason: 'only the lock owner writes the daemon copy' }
  const next = { ...lock, daemon: { pid: record.pid, pidStartedAt: record.pidStartedAt, generation: record.generation } }
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, `${JSON.stringify(next)}\n`)
  renameSync(tmp, path)
  return { ok: true }
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
