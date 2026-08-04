#!/usr/bin/env node
// DETACHED rebuild of the dev container's egress firewall, with a fail-OPEN
// watchdog. The sanctioned way to run `init-firewall.sh` — never by hand.
//
//   node scripts/firewall-rebuild.mjs              # print the plan, change nothing
//   node scripts/firewall-rebuild.mjs --run        # open the gate, arm, launch detached
//   node scripts/firewall-rebuild.mjs --status     # what the last run did
//   node scripts/firewall-rebuild.mjs --open       # emergency: unseal, firewall OFF
//
// WHAT WENT WRONG (04.08.2026). The session ran
// `sudo /usr/local/bin/init-firewall.sh` through the Bash tool. Two things made
// that unsurvivable:
//
//  1. THE SCRIPT CANNOT RE-RUN INSIDE ITS OWN FIREWALL. It flushes every chain
//     and destroys the ipset at the top — and a flush clears RULES, never
//     POLICIES, which are already DROP from the previous run. Its very next step
//     is `curl https://api.github.com/meta`, which now has no rule permitting
//     it. curl sits in its default TCP connect timeout (over two minutes),
//     the container sealed the whole time.
//  2. THE BASH TOOL'S DEFAULT TIMEOUT IS TWO MINUTES. It killed the run at
//     exit 143, mid-flush: chains empty, policies DROP, ipset destroyed. No
//     network, no way to ask for help, session dead with ConnectionRefused.
//
// SO THIS SCRIPT INVERTS BOTH FAILURE DIRECTIONS:
//
//  * IT OPENS THE GATE FIRST. Default policies go to ACCEPT before anything is
//    flushed, so the rebuild's own fetches can succeed and every subsequent
//    failure mode lands on "firewall briefly open" instead of "container
//    sealed". An open firewall in a dev container is a risk; a sealed one is a
//    dead session that cannot even report it.
//  * IT RUNS DETACHED. The rebuild is spawned in its own session (setsid), so a
//    tool timeout kills the launcher and never the rebuild. Nothing in the
//    foreground can be interrupted at the wrong moment, because nothing runs in
//    the foreground.
//  * IT ARMS A WATCHDOG. A supervisor holds a deadline; if the rebuild has not
//    reported success by then, the gate is opened again — and it is opened on
//    EVERY exit path of the supervisor, including a crash. The watchdog never
//    KILLS the rebuild: killing it mid-run is the original incident. It only
//    guarantees the container stays reachable while the rebuild finishes or
//    fails.
//
// Every state change is written to local/ (git-ignored) so `--status`
// can answer from a second, short-lived process — the reader never has to hold
// a long call open.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { isMainModule } from './is-main.mjs'
import { repoPath } from './repo-paths.mjs'

/** The container's own firewall script. Read-only from this repo's point of view. */
export const FIREWALL_SCRIPT = '/usr/local/bin/init-firewall.sh'

/**
 * This file, for the detached relaunch. Resolved through `repoPath` rather than
 * `new URL(import.meta.url).pathname`, which hands back a PERCENT-ENCODED path:
 * a repo under `/work space/` or any path with a `#` would relaunch a file that
 * does not exist — and the failure lands on the supervisor, i.e. on the half
 * that is supposed to be the recovery.
 */
export const SELF_PATH = repoPath('scripts', 'firewall-rebuild.mjs')

/** Where the run records itself. Git-ignored (`/local/`). */
export const STATE_DIR = repoPath('local')
export const STATE_PATH = repoPath('local', 'firewall-rebuild-state.json')
export const LOG_PATH = repoPath('local', 'firewall-rebuild.log')

/**
 * How long the rebuild may take before the watchdog re-opens the gate. Generous
 * on purpose: a healthy run resolves ~16 domains and fetches the GitHub ranges,
 * which takes well under a minute, but a slow resolver must not trip the
 * watchdog while the run is still honest. The watchdog opening early costs an
 * open firewall; opening late costs a sealed container.
 */
export const WATCHDOG_MS = 4 * 60 * 1000

/** A state older than this describes a run nobody is waiting for any more. */
export const STALE_MS = 30 * 60 * 1000

/**
 * The gate: the smallest set of commands that makes the container reachable
 * again, in the OPENING direction only.
 *
 * Policies alone are not enough — init-firewall.sh appends a blanket REJECT to
 * OUTPUT as its last rule, and a run killed after that line would stay sealed
 * under an ACCEPT policy. The deletes are therefore part of the gate. They are
 * targeted deletes, never a flush: a flush would also tear out the DNS,
 * loopback and host-network rules of a rebuild that is still running, and leave
 * it composing a broken chain on top of the hole.
 */
export const GATE_COMMANDS = [
  ['iptables', '-P', 'OUTPUT', 'ACCEPT'],
  ['iptables', '-P', 'INPUT', 'ACCEPT'],
  ['iptables', '-P', 'FORWARD', 'ACCEPT'],
]

/** Blanket blocks to strip, each retried until it is gone (max REPEAT). */
export const GATE_DELETES = [
  ['iptables', '-D', 'OUTPUT', '-j', 'REJECT', '--reject-with', 'icmp-admin-prohibited'],
  ['iptables', '-D', 'OUTPUT', '-j', 'REJECT'],
  ['iptables', '-D', 'OUTPUT', '-j', 'DROP'],
  ['iptables', '-D', 'INPUT', '-j', 'REJECT'],
  ['iptables', '-D', 'INPUT', '-j', 'DROP'],
]
export const GATE_DELETE_REPEAT = 5

/**
 * Phases a run passes through. `ok` is the only one that is not a problem.
 * `gate-open` is the record of a bare unseal — `--open`, the launcher's rescue
 * path, a supervisor killed by a signal: the gate is open and no rebuild is
 * behind it. Without that record `--status` answered "no run on record" while
 * the firewall was OFF, which is the complacent direction.
 */
export const PHASES = ['idle', 'running', 'ok', 'failed', 'watchdog-opened', 'gate-open']

/**
 * Signals that must still reach the gate. `process.on('exit')` does NOT fire on
 * any of them, so a `pkill -f node`, a container stop or an OOM kill of the
 * process group would otherwise leave the child dead mid-flush and the gate
 * SHUT — the exact failure this whole script exists to make impossible.
 */
export const SUPERVISOR_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP']

// ---- pure helpers ---------------------------------------------------------

/** Which mode the argv asks for, and with which knobs. */
export function parseArgs(argv = []) {
  const has = (f) => argv.includes(f)
  const num = (f, fallback) => {
    const i = argv.indexOf(f)
    if (i < 0) return fallback
    const v = Number(argv[i + 1])
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  let mode = 'plan'
  if (has('--supervise')) mode = 'supervise'
  else if (has('--status')) mode = 'status'
  else if (has('--open')) mode = 'open'
  else if (has('--run')) mode = 'run'
  return { mode, watchdogMs: num('--watchdog-ms', WATCHDOG_MS), force: has('--force') }
}

/**
 * Read a state record and say what it means NOW. A `running` record whose
 * supervisor died leaves no further writer, so age is the only honest signal —
 * past the stale bar it is reported as abandoned rather than as in flight.
 */
export function classifyState(state, now = Date.now(), staleMs = STALE_MS) {
  if (!state || typeof state !== 'object' || !PHASES.includes(state.phase)) {
    return { phase: 'idle', stale: false, ageMs: 0 }
  }
  const ageMs = Math.max(0, now - Number(state.updatedAt ?? 0))
  const stale = ageMs > staleMs
  return { phase: state.phase, stale, ageMs }
}

/** Is another rebuild plausibly in flight right now? */
export function runInFlight(state, now = Date.now(), staleMs = STALE_MS) {
  const c = classifyState(state, now, staleMs)
  return c.phase === 'running' && !c.stale
}

/**
 * Should the watchdog fire? Pure, so the deadline arithmetic is testable without
 * waiting four minutes. It fires exactly once, and only while the run has not
 * reported success.
 */
export function watchdogDue({ phase = 'running', startedAt = 0, now = Date.now(), watchdogMs = WATCHDOG_MS } = {}) {
  if (phase === 'ok') return false
  if (phase === 'watchdog-opened') return false
  return now - Number(startedAt || 0) >= watchdogMs
}

/** One line per state, for `--status`. */
export function formatStatus(state, now = Date.now()) {
  const c = classifyState(state, now)
  const secs = Math.round(c.ageMs / 1000)
  switch (c.phase) {
    case 'idle':
      return 'firewall-rebuild: no run on record.'
    case 'running':
      return c.stale
        ? `firewall-rebuild: a run started ${secs}s ago and never reported back — its supervisor is gone.\n` +
            'The gate was opened before it started, so the container is reachable; check the log and re-run.'
        : `firewall-rebuild: RUNNING for ${secs}s (detached). Ask again in a moment.`
    case 'ok':
      return `firewall-rebuild: last run SUCCEEDED ${secs}s ago — the firewall is up and restrictive.`
    case 'failed':
      return (
        `firewall-rebuild: last run FAILED ${secs}s ago (exit ${state.exitCode ?? '?'}).\n` +
        'The gate was re-opened, so the FIREWALL IS OFF and the container is reachable. Read the log, ' +
        'fix the cause, then run --run again.'
      )
    case 'watchdog-opened':
      return (
        `firewall-rebuild: the WATCHDOG fired ${secs}s ago — the run had not reported success in time.\n` +
        'The gate was re-opened, so the FIREWALL IS OFF and the container is reachable. Read the log.'
      )
    case 'gate-open':
      return (
        `firewall-rebuild: the gate was OPENED ${secs}s ago with no rebuild behind it` +
        `${state.gateOpenReason ? ` (${state.gateOpenReason})` : ''}.\n` +
        'THE FIREWALL IS OFF and the container is reachable. This is not a resting state — rebuild with\n' +
        '  node scripts/firewall-rebuild.mjs --run'
      )
    default:
      return 'firewall-rebuild: unknown state.'
  }
}

// ---- I/O ------------------------------------------------------------------

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeState(patch) {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    const next = { ...(readState() ?? {}), ...patch, updatedAt: Date.now() }
    writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + '\n')
    return next
  } catch {
    return null
  }
}

function log(line) {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    const fd = openSync(LOG_PATH, 'a')
    writeFileSync(fd, `[${new Date().toISOString()}] ${line}\n`)
    return fd
  } catch {
    return null
  }
}

/** One privileged command, bounded. Failures are returned, never thrown. */
function sudo(args, { timeout = 10_000 } = {}) {
  try {
    execFileSync('sudo', ['-n', ...args], {
      encoding: 'utf8',
      timeout,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'failed' }
  }
}

/**
 * Make the container reachable. Never throws and never gives up early: each
 * command is independent, and a failure of one must not stop the others — this
 * is the last line of defence against a dead session.
 */
export function openGate() {
  const done = []
  for (const cmd of GATE_COMMANDS) done.push({ cmd: cmd.join(' '), ...sudo(cmd) })
  for (const cmd of GATE_DELETES) {
    for (let i = 0; i < GATE_DELETE_REPEAT; i++) {
      const r = sudo(cmd)
      if (!r.ok) break // no such rule (any more) — that is the goal, not an error
      done.push({ cmd: cmd.join(' '), ok: true })
    }
  }
  return done
}

/**
 * The recovery call, IDEMPOTENT AND UNLATCHED. It used to fire once per process
 * and then go quiet, which cost twice over: a run that tripped the watchdog and
 * only afterwards failed between init-firewall.sh's DROP policies and its
 * allowlist ACCEPT stayed SEALED with nothing left to rescue it, and in the
 * ordinary case — the rebuild's own verification failing after the ruleset is
 * fully in place — `--status` announced a firewall that was OFF while it was in
 * fact restrictive. Opening an already-open gate costs three cheap iptables
 * calls; not opening a shut one costs the session.
 */
export function createReopener({ open = openGate, record = log } = {}) {
  return (why) => {
    const done = open()
    record(`WATCHDOG/RECOVERY: gate re-opened — ${why}. THE FIREWALL IS OFF.`)
    return done
  }
}

/**
 * Wire EVERY way out of the supervisor to the gate: a clean exit, a crash, and
 * the three signals `process.on('exit')` never sees. Injected rather than
 * closed over so the wiring itself is testable without a live firewall.
 */
export function installRecovery({ on, exit, reopen, isDone, onSignal = () => {} }) {
  on('exit', () => {
    if (!isDone()) reopen('supervisor exited without a successful rebuild')
  })
  for (const signal of SUPERVISOR_SIGNALS) {
    on(signal, () => {
      if (!isDone()) {
        reopen(`supervisor killed by ${signal}`)
        onSignal(signal)
      }
      exit(0)
    })
  }
}

// ---- modes ----------------------------------------------------------------

function planText() {
  return [
    'firewall-rebuild — PLAN ONLY, nothing was changed. Add --run to execute.',
    '',
    `  1. open the gate:      ${GATE_COMMANDS.map((c) => c.join(' ')).join(' ; ')}`,
    '     (and strip any blanket REJECT/DROP left in OUTPUT/INPUT)',
    '     WHY FIRST: the rebuild flushes the chains while the policies stay DROP, and its own',
    '     `curl https://api.github.com/meta` would then have no rule permitting it. That hang is',
    '     what ran into the tool timeout on 04.08.2026 and left the container sealed.',
    `  2. arm the watchdog:   re-open the gate if no success is reported within ${Math.round(WATCHDOG_MS / 1000)}s`,
    `  3. launch detached:    sudo -n ${FIREWALL_SCRIPT}  (own session — no tool timeout can reach it)`,
    `  4. read the outcome:   node scripts/firewall-rebuild.mjs --status   (log: ${LOG_PATH})`,
    '',
    'The watchdog never kills the rebuild — killing it mid-run IS the incident. It only',
    'guarantees the container stays reachable while the rebuild finishes or fails.',
  ].join('\n')
}

function doRun({ watchdogMs, force }) {
  if (process.platform !== 'linux') {
    console.error('firewall-rebuild: this is a Linux container mechanism.')
    return 1
  }
  if (!existsSync(FIREWALL_SCRIPT)) {
    console.error(`firewall-rebuild: ${FIREWALL_SCRIPT} does not exist — nothing to rebuild.`)
    return 1
  }
  const state = readState()
  if (runInFlight(state) && !force) {
    console.error(formatStatus(state))
    console.error('Add --force to launch anyway.')
    return 1
  }

  // 1. Open the gate BEFORE anything is flushed. From here on, every failure
  //    mode is "firewall open", never "container sealed".
  const opened = openGate()
  log(`gate opened before rebuild (${opened.filter((d) => d.ok).length}/${opened.length} commands ok)`)

  // 2 + 3. One detached supervisor holds the watchdog AND the rebuild, so the
  //    deadline and the child's exit are observed by the same process and can
  //    never race two independent watchers against each other.
  const child = spawn(process.execPath, [SELF_PATH, '--supervise', '--watchdog-ms', String(watchdogMs)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()

  writeState({ phase: 'running', startedAt: Date.now(), supervisorPid: child.pid, exitCode: null })
  console.log(
    `firewall-rebuild: launched detached (supervisor pid ${child.pid}).\n` +
      'The gate is OPEN until the rebuild re-seals it, so the container stays reachable throughout.\n' +
      `Watchdog: ${Math.round(watchdogMs / 1000)}s. Read the outcome with:\n` +
      '  node scripts/firewall-rebuild.mjs --status',
  )
  return 0
}

/**
 * The detached half. Runs the rebuild, holds the deadline, and opens the gate on
 * every path that is not a clean success — including its own crash.
 */
function doSupervise({ watchdogMs }) {
  const startedAt = Date.now()
  let phase = 'running'
  const reopen = createReopener()

  installRecovery({
    on: (event, handler) => process.on(event, handler),
    exit: (code) => process.exit(code),
    reopen,
    isDone: () => phase === 'ok',
    // A signal leaves no exit code to report, so the record says what is true:
    // the gate is open and nothing is behind it.
    onSignal: (signal) => writeState({ phase: 'gate-open', gateOpenReason: `supervisor killed by ${signal}` }),
  })

  writeState({ phase: 'running', startedAt, exitCode: null })
  log(`rebuild starting: sudo -n ${FIREWALL_SCRIPT}`)

  let out = 'ignore'
  const fd = (() => {
    try {
      mkdirSync(STATE_DIR, { recursive: true })
      return openSync(LOG_PATH, 'a')
    } catch {
      return null
    }
  })()
  if (fd !== null) out = fd

  const child = spawn('sudo', ['-n', FIREWALL_SCRIPT], {
    stdio: ['ignore', out, out],
    windowsHide: true,
  })

  const timer = setTimeout(() => {
    if (watchdogDue({ phase, startedAt, now: Date.now(), watchdogMs })) {
      phase = 'watchdog-opened'
      reopen(`no success within ${Math.round(watchdogMs / 1000)}s`)
      writeState({ phase, exitCode: null })
      // Deliberately NOT killed: a rebuild killed mid-run is the original
      // incident. It may still finish and re-seal correctly on its own.
    }
  }, watchdogMs)
  timer.unref?.()

  child.on('error', (e) => {
    clearTimeout(timer)
    phase = 'failed'
    log(`rebuild could not start: ${e && e.message}`)
    reopen('the rebuild could not be started')
    writeState({ phase, exitCode: null })
    process.exit(0)
  })

  child.on('exit', (code, signal) => {
    clearTimeout(timer)
    if (code === 0) {
      phase = 'ok'
      log('rebuild finished successfully — the firewall is up and restrictive.')
      writeState({ phase, exitCode: 0 })
    } else {
      phase = 'failed'
      log(`rebuild FAILED (exit ${code}, signal ${signal ?? 'none'})`)
      reopen(`the rebuild exited ${code}${signal ? ` on ${signal}` : ''}`)
      writeState({ phase, exitCode: code })
    }
    process.exit(0)
  })
  return 0
}

function doOpen() {
  const done = openGate()
  const failed = done.filter((d) => !d.ok)
  log(`manual --open: ${done.length - failed.length}/${done.length} commands ok`)
  // Recorded, or the next `--status` would answer "no run on record" while the
  // firewall is OFF — a silence that reads like "nothing happened here".
  writeState({ phase: 'gate-open', gateOpenReason: 'manual --open', exitCode: null })
  console.log(
    'firewall-rebuild --open: the gate was opened. THE FIREWALL IS NOW OFF — outbound traffic is\n' +
      'unrestricted. This is the emergency unseal, not a resting state: rebuild with\n' +
      '  node scripts/firewall-rebuild.mjs --run',
  )
  for (const f of failed) console.error(`  (failed: sudo -n ${f.cmd} — ${f.error})`)
  return 0
}

if (isMainModule(import.meta.url)) {
  // The read-only modes are decided BEFORE the recovering try/catch, so a throw
  // in `--status` or the plan can never open a firewall nobody asked it to touch.
  const args = parseArgs(process.argv.slice(2))
  if (args.mode === 'plan') {
    console.log(planText())
    process.exit(0)
  }
  if (args.mode === 'status') {
    console.log(formatStatus(readState()))
    process.exit(0)
  }
  try {
    if (args.mode === 'open') process.exit(doOpen())
    if (args.mode === 'supervise') doSupervise(args)
    else if (args.mode === 'run') process.exit(doRun(args))
  } catch (e) {
    // Fail-OPEN: the launcher broke somewhere between opening the gate and
    // handing the rebuild to its supervisor, so the container must not be left
    // in whatever half-state that was.
    console.error(`firewall-rebuild: ${e && e.message} — opening the gate to be safe.`)
    try {
      openGate()
      writeState({ phase: 'gate-open', gateOpenReason: 'launcher rescue', exitCode: null })
    } catch {
      /* nothing further can be done from here */
    }
    process.exit(1)
  }
}
