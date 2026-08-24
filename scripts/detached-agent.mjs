#!/usr/bin/env node
// THE COMMON WORKER CONTRACT — step 3 of the "Ordered work" in
// docs/handover-architecture.md (work-order point 834, the front stage of 676;
// union M5).
//
// A handover-capable worker satisfies one contract, whatever model runs inside
// it: heartbeat, log, checkpoint acknowledgment, explicit terminal status,
// cancellation that preserves the branch, and a lease check before every push.
// This file is that contract three times over:
//   - EXPORTED HELPERS the daemon uses to spawn a worker with the escape that
//     actually survives (mechanism 1): detached, group leader, stdio on a FILE
//     DESCRIPTOR — never a pipe a dying parent can break — and unref()ed.
//   - THE WORKER CLI the daemon spawns: `--runner stub` is the hermetic worker
//     the drills use; `--runner author-sol` WRAPS the proven scripts/author-sol.mjs
//     without changing its authoring behavior — the wrapper is the daemon's
//     child and holds the runner's pipes, so the session's death reaches neither.
//   - THE CONTRACT PATHS a successor probes, all inside the attempt's own state
//     directory, so adoption needs no live predecessor.
//
// STILL DARK: only the daemon spawns this, and no daemon starts while the
// activation flag refuses (scripts/durable-lane-flag-core.mjs).
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, closeSync, constants as fsConstants, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { leaseAllowsWrite } from './batch-attempt-lease-core.mjs'

/** Every path of the contract, derived from the attempt directory alone. */
export function attemptPaths(attemptDir) {
  return {
    dir: attemptDir,
    logPath: join(attemptDir, 'worker.log'),
    heartbeatPath: join(attemptDir, 'heartbeat'),
    statusPath: join(attemptDir, 'status.json'),
    leasePath: join(attemptDir, 'lease.json'),
    checkpointRequestPath: join(attemptDir, 'checkpoint-request.json'),
    checkpointAckPath: join(attemptDir, 'checkpoint-ack.json'),
  }
}

/** THE ESCAPE (mechanism 1, copied from scripts/batch-autostart.mjs, the process
 *  in this repository that already escapes correctly): `detached` makes the child
 *  a group leader so the session's group signal never reaches it; the stdio is a
 *  file descriptor, so nothing the child writes needs a live reader and no
 *  parent's death can break a write; `unref()` frees the spawning event loop.
 *  The fd is closed in the PARENT — the child holds its own copy. */
export function spawnDetached({ cmd, args, cwd, logPath, env = process.env }) {
  const out = openSync(logPath, 'a')
  try {
    const child = spawn(cmd, args, {
      cwd,
      env,
      windowsHide: true,
      detached: true,
      stdio: ['ignore', out, out],
    })
    child.unref()
    return { pid: child.pid }
  } finally {
    closeSync(out)
  }
}

/** Atomic small-file write for status and acks: a reader never sees half a
 *  record. (The durability fsync lives in the state store; these files are
 *  advisory runtime state a successor re-probes anyway.) The tmp name is
 *  RANDOM and the create EXCLUSIVE, the store's rule: a predictable pid-named
 *  tmp is plantable as a symlink, and a truncating open writes through one. */
function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp-${randomBytes(8).toString('hex')}`
  const fd = openSync(tmp, 'wx', 0o600)
  try {
    writeSync(fd, `${JSON.stringify(value)}\n`)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
}

/** In-place write that REFUSES to follow a symlink at its target — for the
 *  heartbeats, which are overwritten in place at tick rate (an atomic
 *  tmp-rename per tick would buy nothing: their readers take the mtime, and a
 *  torn read of a timestamp fails no invariant). O_NOFOLLOW makes a planted
 *  link fail the write loudly instead of landing it where the planter chose. */
export function writeFileNoFollow(path, text) {
  const fd = openSync(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW, 0o600)
  try {
    writeSync(fd, text)
  } finally {
    closeSync(fd)
  }
}

export function readJsonIfAny(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function git(args, cwd) {
  const res = spawnSync('git', args, { windowsHide: true, cwd, encoding: 'utf8' })
  return { ok: res.status === 0, out: (res.stdout || '').trim(), err: (res.stderr || '').trim() }
}

/** Installs the worktree's pre-push lease gate: a hook that re-runs
 *  leaseAllowsWrite for the WRAPPER's identity on every `git push` from this
 *  worktree, whoever performs it — the runner included. JSON.stringify is the
 *  quoting: these are absolute paths from controlled directories. */
export function installPrePushHook({ worktree, attemptDir, leaseId, holder }) {
  const hooksDir = join(attemptDir, 'hooks')
  mkdirSync(hooksDir, { recursive: true })
  const scriptPath = join(process.cwd(), 'scripts', 'detached-agent.mjs')
  const line = [
    JSON.stringify(process.execPath),
    JSON.stringify(scriptPath),
    'lease-gate',
    '--attempt-dir',
    JSON.stringify(attemptDir),
    '--lease-id',
    JSON.stringify(leaseId),
    '--holder-pid',
    String(holder.pid),
    '--holder-started',
    String(holder.pidStartedAt),
  ].join(' ')
  writeFileSync(join(hooksDir, 'pre-push'), `#!/bin/sh\nexec ${line}\n`, { mode: 0o700 })
  return git(['config', 'core.hooksPath', hooksDir], worktree).ok
}

/** The hook's other end: exit 0 only on an affirmative write verdict. Runs
 *  with the worktree as cwd, so everything it reads is an absolute path. */
export function leaseGateVerdict(args) {
  if (!args?.['attempt-dir'] || !args['lease-id']) return { verdict: 'fenced', reason: 'the lease gate was invoked without its attempt directory or lease id' }
  const lease = readJsonIfAny(attemptPaths(args['attempt-dir']).leasePath)?.lease ?? null
  return leaseAllowsWrite({
    lease,
    holder: { pid: Number(args['holder-pid']), pidStartedAt: Number(args['holder-started']) },
    leaseId: args['lease-id'],
    now: Date.now(),
  })
}

// ---------------------------------------------------------------------------
// THE WORKER PROCESS
// ---------------------------------------------------------------------------

export const WORKER_TICK_MS = 250
export const STUB_WORK_EVERY_MS = 1200

/** Exit codes are part of the contract: the daemon reads them from the status
 *  file, never from a wait() it may not be alive to perform. */
export const WORKER_EXIT = Object.freeze({ done: 0, runnerFailed: 1, badInvocation: 2, fenced: 3 })

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (!flag?.startsWith('--') || value === undefined) return null
    args[flag.slice(2)] = value
  }
  return args
}

async function runWorker(argv) {
  const args = parseArgs(argv)
  const required = ['runner', 'point', 'branch', 'worktree', 'attempt-dir', 'lease-id']
  if (!args || required.some((k) => !args[k])) {
    console.error(`detached-agent: required flags: ${required.map((k) => `--${k}`).join(' ')}`)
    process.exit(WORKER_EXIT.badInvocation)
  }
  const paths = attemptPaths(args['attempt-dir'])
  mkdirSync(paths.dir, { recursive: true })
  const tickMs = Number(args['tick-ms']) > 0 ? Number(args['tick-ms']) : WORKER_TICK_MS
  const workEveryMs = Number(args['work-every-ms']) > 0 ? Number(args['work-every-ms']) : STUB_WORK_EVERY_MS
  const self = { pid: process.pid, pidStartedAt: ownStartTime() }
  const log = (line) => appendFileSync(paths.logPath, `${new Date().toISOString()} ${line}\n`)
  const status = (phase, extra = {}) => writeJsonAtomic(paths.statusPath, { phase, at: Date.now(), pid: process.pid, ...extra })

  let stopping = null
  process.on('SIGTERM', () => {
    // Cancellation preserves the branch (M43): nothing is deleted, nothing is
    // reset — the worker records the terminal state and leaves.
    stopping = 'cancelled'
  })

  /** The lease check before EVERY push (M40): fenced means stop, branch intact. */
  const mayPush = () => {
    const lease = readJsonIfAny(paths.leasePath)?.lease ?? null
    return leaseAllowsWrite({ lease, holder: self, leaseId: args['lease-id'], now: Date.now() })
  }

  const push = () => {
    const gate = mayPush()
    if (gate.verdict !== 'write') return { ok: false, fenced: true, why: gate.reason }
    const res = git(['push', 'origin', args.branch], args.worktree)
    return { ok: res.ok, fenced: false, why: res.err }
  }

  const tip = () => git(['rev-parse', 'HEAD'], args.worktree).out || null

  /** A checkpoint acknowledgment is honest about what it proves: the pushed SHA,
   *  and whether uncommitted work remains — a wrapper cannot commit on the
   *  runner's behalf, so `dirty: true` is what makes the daemon mark the attempt
   *  non-transferable (M20) instead of this file lying. */
  let lastAckedRequest = null
  const answerCheckpoint = () => {
    const request = readJsonIfAny(paths.checkpointRequestPath)
    if (!request?.requestId || request.requestId === lastAckedRequest) return
    const pushed = push()
    if (pushed.fenced) return fencedExit(pushed.why)
    const dirty = git(['status', '--porcelain'], args.worktree).out !== ''
    writeJsonAtomic(paths.checkpointAckPath, {
      requestId: request.requestId,
      at: Date.now(),
      sha: tip(),
      pushedOk: pushed.ok,
      dirty,
    })
    lastAckedRequest = request.requestId
    log(`checkpoint ${request.requestId}: pushedOk=${pushed.ok} dirty=${dirty}`)
  }

  const fencedExit = (why) => {
    log(`fenced: ${why}`)
    status('fenced', { reason: why, sha: tip() })
    process.exit(WORKER_EXIT.fenced)
  }

  status('running', { runner: args.runner })
  log(`worker up: runner=${args.runner} point=${args.point} branch=${args.branch}`)

  // The daemon grants the lease to THIS process's identity right after the
  // spawn, so at startup absence means "not yet handed over", not dispossession.
  // Bounded: a worker no lease ever reaches is fenced like any other.
  const leaseDeadline = Date.now() + 10_000
  while (!readJsonIfAny(paths.leasePath)?.lease && Date.now() < leaseDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  // The wait above is PATIENCE, not permission. What licenses the runner is an
  // AFFIRMATIVE lease verdict for this process and this lease id, inside its
  // term: a missed deadline, a foreign holder or a stale lease fences HERE,
  // before any runner exists to do unlicensed work.
  const startGate = mayPush()
  if (startGate.verdict !== 'write') return fencedExit(`refusing to start the runner: ${startGate.reason}`)
  // The lease check before EVERY push (M40), enforced at GIT level: the
  // wrapper cannot intercept pushes its runner performs itself, so a pre-push
  // hook in the worktree runs the same gate for every `git push` from any
  // process, presenting the wrapper's identity baked in at install time.
  if (!installPrePushHook({ worktree: args.worktree, attemptDir: paths.dir, leaseId: args['lease-id'], holder: self })) {
    return fencedExit('the pre-push lease gate could not be installed; an unfenceable worktree runs nothing')
  }

  let runnerChild = null
  let runnerExit = null
  if (args.runner === 'author-sol') {
    // The proven authoring path, UNCHANGED (M2/M5): this wrapper is the daemon's
    // child, so it survives the session, and the runner's pipes end HERE — at a
    // parent that stays alive — never at the session that asked for the work.
    // The runner leads its OWN process group, so cancellation can take its
    // whole subtree with one group signal — a SIGTERM to the immediate child
    // alone leaves grandchildren writing. (If the wrapper itself is SIGKILLed
    // the runner group survives orphaned; the revoked lease and the pre-push
    // hook fence its pushes, and reconciliation reads the orphan.)
    runnerChild = spawn(process.execPath, ['scripts/author-sol.mjs', '--point', args.point], {
      cwd: args.worktree,
      env: process.env,
      windowsHide: true,
      detached: true,
      stdio: ['ignore', openSync(paths.logPath, 'a'), openSync(paths.logPath, 'a')],
    })
    runnerChild.on('close', (code) => {
      runnerExit = code ?? 1
    })
  } else if (args.runner !== 'stub') {
    console.error(`detached-agent: unknown runner "${args.runner}"`)
    process.exit(WORKER_EXIT.badInvocation)
  }

  let lastWorkAt = 0
  const stubWork = () => {
    if (Date.now() - lastWorkAt < workEveryMs) return
    lastWorkAt = Date.now()
    const file = join(args.worktree, 'stub-progress.txt')
    appendFileSync(file, `${Date.now()}\n`)
    git(['add', 'stub-progress.txt'], args.worktree)
    const committed = git(['-c', 'user.name=stub-worker', '-c', 'user.email=stub@drill', 'commit', '-q', '-m', `stub step at ${Date.now()}`], args.worktree)
    if (!committed.ok) return log(`stub commit failed: ${committed.err}`)
    const pushed = push()
    if (pushed.fenced) return fencedExit(pushed.why)
    log(`stub step: pushed=${pushed.ok} sha=${tip()}`)
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const runnerGone = () => runnerChild === null || runnerExit !== null
  const killRunnerGroup = (signal) => {
    try {
      process.kill(-runnerChild.pid, signal)
    } catch {
      try {
        runnerChild.kill(signal)
      } catch {
        /* already gone */
      }
    }
  }
  /** Cancellation is proven, never assumed: SIGTERM to the runner's group, a
   *  bounded grace, SIGKILL, and only a REAPED runner lets the worker record a
   *  terminal state — a durable 'cancelled' over a still-writing subtree is
   *  the lie this function exists to prevent. */
  const stopRunner = async () => {
    if (runnerGone()) return true
    killRunnerGroup('SIGTERM')
    let deadline = Date.now() + 5000
    while (!runnerGone() && Date.now() < deadline) await sleep(100)
    if (runnerGone()) return true
    killRunnerGroup('SIGKILL')
    deadline = Date.now() + 2000
    while (!runnerGone() && Date.now() < deadline) await sleep(100)
    return runnerGone()
  }

  // The loop IS the worker: heartbeat, checkpoint answers, work, cancellation.
  for (;;) {
    writeFileNoFollow(paths.heartbeatPath, `${Date.now()}\n`)
    if (stopping) {
      if (!(await stopRunner())) {
        status('cancel-blocked', { sha: tip(), reason: 'the runner survived SIGTERM and SIGKILL; nothing here claims it stopped' })
        log('worker leaving: cancel-blocked; the runner still lives, fenced by its lease')
        process.exit(WORKER_EXIT.runnerFailed)
      }
      status(stopping, { sha: tip() })
      log(`worker leaving: ${stopping}; branch preserved`)
      process.exit(WORKER_EXIT.done)
    }
    answerCheckpoint()
    if (args.runner === 'stub') stubWork()
    if (args.runner === 'author-sol' && runnerExit !== null) {
      const pushed = push()
      if (pushed.fenced) return fencedExit(pushed.why)
      status('done', { sha: tip(), runnerExit, pushedOk: pushed.ok })
      log(`runner exited ${runnerExit}`)
      process.exit(runnerExit === 0 ? WORKER_EXIT.done : WORKER_EXIT.runnerFailed)
    }
    await new Promise((resolve) => setTimeout(resolve, tickMs))
  }
}

/** This process's own start time, by the same /proc reading the lock probes use;
 *  falls back to a coarse now-minus-uptime never worse than the tolerance. */
function ownStartTime() {
  try {
    const stat = readFileSync(`/proc/${process.pid}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const startTicks = Number(fields[19])
    const uptime = Number(readFileSync('/proc/uptime', 'utf8').split(' ')[0])
    const bootMs = Date.now() - uptime * 1000
    return bootMs + (startTicks / 100) * 1000
  } catch {
    return Date.now() - process.uptime() * 1000
  }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  if (argv[0] === 'lease-gate') {
    // The pre-push hook's entry point: it runs with the WORKTREE as cwd, so it
    // sits before the repository-root check and reads only absolute paths.
    const gate = leaseGateVerdict(parseArgs(argv.slice(1)) ?? {})
    if (gate.verdict !== 'write') {
      console.error(`pre-push refused: ${gate.reason}`)
      process.exit(1)
    }
    process.exit(0)
  }
  if (!existsSync('scripts/detached-agent.mjs')) {
    // The spawn plan passes a repo-relative script path; a worker started from
    // elsewhere would silently resolve author-sol against the wrong tree.
    console.error('detached-agent: must be started from the repository root')
    process.exit(WORKER_EXIT.badInvocation)
  }
  runWorker(argv)
}
