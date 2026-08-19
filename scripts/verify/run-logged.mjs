// The LOGGED verify invocation (point 373 e): run the regression, write its
// WHOLE output to a file, and hand the caller a BOUNDED digest of it.
//
// The problem it solves is a context one, not a testing one. `npm test` streams
// its transcript into the session that started it — and into every poll of a
// background run — so one red regression can cost tens of thousands of tokens
// for output that is 95 % vitest dump. The session boundary (point 373) fires
// between POINTS and never reaches inside a heavy one; this does.
//
// WHAT THE CALLER STILL SEES, because a digest that hides a failure is worse
// than the cost it saves:
//   - LIVE, while the run goes: the runner's own structured lines only — the
//     per-suite PASS/FAIL/SKIP verdicts, the stage headings, the retry notices
//     and the indented FAIL/ERR echoes (vitest's own ` FAIL  file > case` lines
//     among them). About one line per suite, so a background poller sees
//     progress and a red suite names itself the moment it goes red.
//   - AT THE END: exit code, duration, how much was captured, WHERE the log is,
//     the FAILING units by name with their first failing checks, and — only on
//     a failure — the last few dozen raw lines, which catch a crash stack the
//     patterns have no name for.
//   - ON DEMAND: `--show <log>` reads a bounded WINDOW back (tail/grep/max), so
//     the way to the detail is never `cat`.
//   - AS ONE OBJECT (point 592): a RUN RECORD beside the log, written the moment
//     the run starts and closed with a structured RECEIPT when it ends — exit
//     code, backend(s), suites, the git HEAD it ran on, the log path, the
//     failing names UNCUT, the frames EXPECTED against the frames WRITTEN, and
//     how often anybody polled it. `scripts/verify/run-wait.mjs` awaits and
//     reads that record, which is what makes a poll loop unnecessary; the frame
//     comparison is the half point 375's shutter cannot see, since a frame that
//     was never written at all raises nothing today.
//
// Usage:
//   node scripts/verify/run-logged.mjs [<run-all args…>]   (npm test / test:small / test:large)
//   node scripts/verify/run-logged.mjs --show <log> [--tail 120] [--grep "FAIL|ERR:"] [--max 400]
// Flags consumed here (everything else is forwarded to run-all.mjs verbatim):
//   --stream        echo every raw line as well (the pre-373 behaviour)
//   --quiet         no live echo; the end digest then carries the structured lines
//   --keep N        the structured-line budget of the end digest (default 120)
//   --tail N        raw tail lines on a failure (default 40)
//   --log-file P    write the log here instead of local/verify-logs/<stamp>.log
//                   (a launch WITHOUT it re-execs itself with the resolved path
//                   appended — the record writer's argv must name its log; see
//                   `commandNamesRun` in scripts/batch-in-flight.mjs)
import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs'
import { constants as osConstants } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULTS, buildDigest, createSelector, failureSurface, showWindow } from './run-digest-core.mjs'
import { backendsFrom, buildReceipt, formatReceipt, planRun } from './run-wait-core.mjs'
import { framesWrittenSince, gitPosition, readRecord, recordPathFor, selfCommandLine, writeRecord } from './run-record.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/** The termination signals both layers FORWARD to their child rather than
 *  dying around it — SIGHUP/SIGQUIT beside the classic two (Sol round 5), so
 *  a hangup reaches the runner instead of killing a middle layer and
 *  orphaning it. */
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']

/** Split our own flags out of the argv; everything else goes to run-all. */
function parseOwnArgs(argv) {
  const own = { show: null, grep: null, tail: DEFAULTS.tailLines, max: 400, keep: DEFAULTS.maxKeptLines, stream: false, quiet: false, logFile: null }
  const forward = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = () => argv[++i]
    if (a === '--show') own.show = value()
    else if (a === '--grep') own.grep = value()
    else if (a === '--tail') own.tail = Number(value())
    else if (a === '--max') own.max = Number(value())
    else if (a === '--keep') own.keep = Number(value())
    else if (a === '--log-file') own.logFile = value()
    else if (a === '--stream') own.stream = true
    else if (a === '--quiet') own.quiet = true
    else forward.push(a)
  }
  if (!Number.isFinite(own.tail)) own.tail = DEFAULTS.tailLines
  if (!Number.isFinite(own.max)) own.max = 400
  if (!Number.isFinite(own.keep)) own.keep = DEFAULTS.maxKeptLines
  return { own, forward }
}

/** `2026-08-07T14-31-09-large.log` — sortable, and it says what it ran. */
function logPathFor(args, own) {
  if (own.logFile) return isAbsolute(own.logFile) ? own.logFile : join(ROOT, own.logFile)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
  const label = args.filter((a) => !a.startsWith('-')).join('-').replace(/[^\w.-]/g, '_') || 'verify'
  const dir = process.env.VERIFY_LOG_DIR ? join(ROOT, process.env.VERIFY_LOG_DIR) : join(ROOT, 'local', 'verify-logs')
  return join(dir, `${stamp}-${label}.log`)
}

/** A path the digest can print without a machine-specific prefix. */
function forDisplay(path) {
  const rel = relative(ROOT, path)
  return rel && !rel.startsWith('..') ? rel.replace(/\\/g, '/') : path
}

// ── `--show`: read a bounded window back out of a saved log ────────────────
// Its own function, and the run below is in an `else`: neither may fall into
// the other. Written the first way — a `--show` branch that merely printed and
// ran on — the reader started a full LARGE regression behind the answer.
function showLog(path) {
  const full = isAbsolute(path) ? path : join(ROOT, path)
  let text
  try {
    text = readFileSync(full, 'utf8')
  } catch (err) {
    console.log(`no such log: ${forDisplay(full)} (${err.code ?? err.message})`)
    return 1
  }
  const all = text.split(/\r?\n/)
  const win = showWindow(all, { grep: own.grep, tail: own.tail, max: own.max })
  const what = own.grep ? `${win.matched} line(s) matching /${own.grep}/i of ${all.length}` : `${all.length} line(s)`
  console.log(`── ${forDisplay(full)} — ${what}; showing the last ${win.lines.length}${win.truncated > 0 ? ` (${win.truncated} not shown)` : ''}`)
  for (const l of win.lines) console.log(l)
  return 0
}

/**
 * CLOSE THE RUN RECORD AND HAND BACK THE RECEIPT LINES (point 592).
 *
 * The record is re-read first: a `--status` poll may have raised its counter
 * while the run went, and the receipt is where that count is PRINTED — the rule
 * "await, do not poll" is visible in the transcript rather than remembered.
 *
 * Never throws. A receipt is worth a great deal and a run is worth more; a
 * failure here says so in one line and leaves the digest above untouched.
 */
function closeRecord({ lines, exitCode, started, recordPath, baseRecord }) {
  try {
    const prior = readRecord(recordPath) ?? baseRecord
    const framesWritten = baseRecord.expectedFrames > 0 ? framesWrittenSince(started) : 0
    const receipt = buildReceipt({
      command: baseRecord.command,
      tier: baseRecord.tier,
      suites: baseRecord.suites,
      backends: backendsFrom({ lines, verifyGl: baseRecord.verifyGl, fallback: baseRecord.backends }),
      head: baseRecord.head,
      branch: baseRecord.branch,
      logPath: baseRecord.log,
      exitCode,
      startedAt: started,
      finishedAt: Date.now(),
      polls: prior.polls ?? 0,
      // UNCUT on purpose (point 592): the digest above bounds its detail lines
      // because it is read on every poll; the receipt is read ONCE, and a
      // truncated failure list is what makes a reader start the run again.
      failing: failureSurface(lines, { maxDetails: Number.POSITIVE_INFINITY }),
      framesExpected: baseRecord.expectedFrames,
      framesWritten,
    })
    writeRecord(recordPath, {
      ...prior,
      status: 'finished',
      finishedAt: receipt.finishedAt,
      exitCode,
      framesWritten,
      receipt,
    })
    return formatReceipt(receipt)
  } catch (err) {
    return [`── verify receipt ── unavailable (${err?.message ?? err}); the digest above and the log still stand.`]
  }
}

/** Run the regression, log all of it, print the bounded digest. */
function runVerify() {
  const logPath = logPathFor(forward, own)
  mkdirSync(dirname(logPath), { recursive: true })
  const log = createWriteStream(logPath, { flags: 'a' })
  const shown = forDisplay(logPath)
  const command = `verify ${forward.join(' ') || '(default: LARGE)'}`

  console.log(`# ${command} — full output → ${shown}`)

  // THE RUN AS AN OBJECT (point 592), written BEFORE the child exists: a caller
  // that wants to await this run must be able to find it the instant the launch
  // returns, and a record written after the spawn would leave that window open.
  const started = Date.now()
  const plan = planRun({ argv: forward, verifyGl: process.env.VERIFY_GL })
  const where = gitPosition()
  const recordPath = recordPathFor(logPath)
  const baseRecord = {
    command,
    args: forward,
    tier: plan.tier,
    suites: plan.suites,
    backends: plan.backends,
    verifyGl: process.env.VERIFY_GL ?? null,
    head: where.head,
    branch: where.branch,
    log: shown,
    startedAt: started,
    expectedRuntimeMs: plan.expectedMs,
    expectedFrames: plan.expectedFrames,
    unmeasuredSuites: plan.unmeasured,
    polls: 0,
    status: 'running',
    pid: process.pid,
    // The writer's own argv, recorded as EVIDENCE. The identity the transfer
    // probe matches is the LOG PATH inside it — guaranteed present because a
    // launch without --log-file re-execs itself with the path appended (a bare
    // argv is no identity: a recycled pid re-running the identical default
    // invocation must not read as this run — Sol round 4).
    cmdline: selfCommandLine(),
    finishedAt: null,
    exitCode: null,
    framesWritten: null,
    receipt: null,
  }
  writeRecord(recordPath, baseRecord)

  const child = spawn(process.execPath, [join(HERE, 'run-all.mjs'), ...forward], {
    windowsHide: true,
    cwd: ROOT,
    // stdin inherited so nothing can silently block on input; stdout/stderr piped
    // through us into the log.
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  })

  const lines = []
  const select = createSelector()
  let rawChars = 0
  let pending = ''

  function consume(chunk) {
    const text = String(chunk)
    rawChars += text.length
    log.write(text)
    pending += text
    const parts = pending.split(/\r?\n/)
    pending = parts.pop() ?? ''
    for (const line of parts) {
      lines.push(line)
      const kind = select(line)
      if (own.stream) console.log(line)
      else if (!own.quiet && kind) console.log(line)
    }
  }

  child.stdout.on('data', consume)
  child.stderr.on('data', consume)

  for (const sig of FORWARDED_SIGNALS) {
    process.on(sig, () => {
      try {
        child.kill(sig)
      } catch {
        /* already gone */
      }
    })
  }

  child.on('close', (code, signal) => {
    if (pending !== '') {
      lines.push(pending)
      if (own.stream || (!own.quiet && select(pending))) console.log(pending)
      pending = ''
    }
    log.end()
    const exitCode = code === null ? 1 : code
    const digest = buildDigest({
      lines,
      command: signal ? `${command} (killed by ${signal})` : command,
      exitCode,
      durationMs: Date.now() - started,
      logPath: shown,
      rawChars,
      // The structured lines already went out live; repeating them would pay for
      // them twice. `--quiet` trades the live view for a single end block.
      includeKept: own.quiet,
      maxKeptLines: own.keep,
      tailLines: own.tail,
    })
    console.log(digest.text)
    for (const line of closeRecord({ lines, exitCode, started, recordPath, baseRecord })) console.log(line)
    // NOT process.exit(): stdout may be a pipe, and an explicit exit can drop
    // what is still buffered in it — which is the digest itself. Setting the code
    // and letting the loop drain keeps the caller's copy complete.
    process.exitCode = exitCode
  })

  child.on('error', (err) => {
    console.log(`FAIL  run-logged   could not start the runner: ${err.message}`)
    log.end()
    // The record must never stay `running` for a run that never ran: a Stop
    // guard reading it would take a dead launch for a live wait.
    for (const line of closeRecord({
      lines: [`FAIL  run-logged   could not start the runner: ${err.message}`],
      exitCode: 1,
      started,
      recordPath,
      baseRecord,
    })) console.log(line)
    process.exitCode = 1
  })
}

// ── The default launch RE-EXECS itself with the log path in argv ────────────
// (point 700, Sol round 4). The run record's liveness probe identifies the
// wrapper by the RECORDED LOG PATH standing in the probed process's own argv
// (`commandNamesRun` in scripts/batch-in-flight.mjs) — a bare argv is not an
// identity: a recycled pid re-running the identical default command line would
// read as THIS run. So a launch that names no `--log-file` computes the path
// once and re-execs itself with it appended; the record writer's argv then
// always names its log. Costs one idle shim process for the run's duration —
// Node has no in-place exec — which is nothing beside a browser regression.
// The shim WAITS for the child however long it runs — a child that ignores a
// forwarded signal included. Sol round 5 read that as "can remain alive
// indefinitely"; it is INTENDED: waiting for the child IS the shim's job, its
// exit status is the run's verdict, and the handlers below only forward —
// they never end the shim while the child lives. What round 5 did find real
// is the exit SHAPE: `code === null ? 1` flattened a signal-killed child into
// an ordinary exit-1 failure, so an interrupted run recorded as a red one.
// The termination is now REPRODUCED instead — see the close handler.
function reexecWithLogPath() {
  const logPath = logPathFor(forward, own)
  // The DISPLAY form (ROOT-relative where possible): it is what the record's
  // `log` field will carry, so argv word and recorded path compare equal.
  const child = spawn(process.execPath, [...process.argv.slice(1), '--log-file', forDisplay(logPath)], {
    windowsHide: true,
    stdio: 'inherit',
    env: process.env,
  })
  for (const sig of FORWARDED_SIGNALS) {
    process.on(sig, () => {
      try {
        child.kill(sig)
      } catch {
        /* already gone */
      }
    })
  }
  child.on('close', (code, signal) => {
    if (signal) {
      // A signal-killed child is reproduced, not flattened to exit 1 (Sol
      // round 5). Our own forwarders come off first, so the re-raise reaches
      // the default disposition instead of a handler whose child is already
      // gone.
      for (const sig of FORWARDED_SIGNALS) process.removeAllListeners(sig)
      try {
        process.kill(process.pid, signal)
      } catch {
        /* a signal this platform cannot re-raise — fall through */
      }
      // Reached when the signal could not be re-raised (or until it lands):
      // 128+n is the shell's own spelling of a death by that signal.
      const num = osConstants.signals[signal]
      process.exitCode = typeof num === 'number' ? 128 + num : 1
      return
    }
    process.exitCode = code === null ? 1 : code
  })
  child.on('error', (err) => {
    console.log(`FAIL  run-logged   could not re-exec with the log path: ${err.message}`)
    process.exitCode = 1
  })
}

const { own, forward } = parseOwnArgs(process.argv.slice(2))
if (own.show) process.exitCode = showLog(own.show)
else if (own.logFile) runVerify()
else reexecWithLogPath()
