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
//   --no-ladder "<why>"  start a full pass whose cheap rung is unclimbed, and
//                   RECORD why (the verification ladder, point 1086)
//   --log-file P    write the log here instead of local/verify-logs/<stamp>.log
//                   (a launch WITHOUT it re-execs itself with the resolved path
//                   appended — the record writer's argv must name its log; see
//                   `commandNamesRun` in scripts/batch-in-flight.mjs)
import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs'
import { constants as osConstants } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  advanceOutputProgress,
  buildDigest,
  createSelector,
  failureSurface,
  outputProgressState,
  showWindow,
} from './run-digest-core.mjs'
import { backendsFrom, buildReceipt, formatReceipt, planRun } from './run-wait-core.mjs'
import { framesWrittenSince, gitPosition, newestFrameMtimeMs, progressMarkPathFor, readRecord, recordPathFor, selfCommandLine, touchProgressMark, writeRecord } from './run-record.mjs'
import { emitActivity } from '../batch-activity-journal.mjs'
import { ACTIVITY_EVENTS } from '../batch-activity-journal-core.mjs'
import { budgetToolOutput } from '../tool-output-budget-core.mjs'
import { developmentRunRefusal, parseRunLoggedArgs } from './run-logged-args.mjs'
import { cacheEnvironment, cleanWorktree, findGreenReceipt, formatCachedGreen } from './run-green-cache.mjs'
import { waitForLargeRun } from './large-run-wait.mjs'
import { LADDER_STATUS, formatLadderRefusal } from './ladder-core.mjs'
import { ladderCheck } from './ladder.mjs'
// ONE DEFINITION OF THE PROGRESS LEASE (point 1137): this wrapper renews it, and
// the wait registry decides against it. Two copies of the same 15 minutes is how
// they drift apart.
import { PROGRESS_LEASE_MS } from '../wait-lease-core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
/** How often the writer's progress mark may be re-stamped. The wait reads it
 *  against a 15-minute lease, so a minute of granularity is far finer than any
 *  verdict needs and keeps the writes rare. */
const PROGRESS_RECORD_MS = 60_000
/** How often the writer counts its own frames — the only sign of life a long
 *  render suite gives, because its output does not leave `run-all` until it ends. */
const FRAME_SAMPLE_MS = 30_000
const PROGRESS_EMIT_MS = 60_000
const RUNNER_STARTED_AT = Date.now() - Math.round(process.uptime() * 1000)

function emitRunActivity(
  event,
  { at = Date.now(), recordPath, command, startedAt, leaseUntil = null, result = null, value = null } = {},
) {
  emitActivity({
    event,
    at,
    session: process.env.CLAUDE_SESSION_ID ?? process.env.HOA_SESSION_ID ?? null,
    pid: process.pid,
    pidStartedAt: RUNNER_STARTED_AT,
    generation: null,
    cause: 'named-verification-run',
    // `value` is the run's output progress mark (union entry U3): the reader
    // treats a repeated value as the same progress seen again, so a lease cannot
    // be renewed by output that says nothing new.
    evidence: { id: recordPath, recordPath, command, startedAt, leaseUntil, result, value },
  })
}

/** The termination signals both layers FORWARD to their child rather than
 *  dying around it — SIGHUP/SIGQUIT beside the classic two (Sol round 5), so
 *  a hangup reaches the runner instead of killing a middle layer and
 *  orphaning it. */
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']

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
  const shown = forDisplay(full)
  try {
    const win = showWindow(all, { grep: own.grep, tail: own.tail, max: own.max })
    const what = own.grep ? `${win.matched} line(s) matching /${own.grep}/i of ${all.length}` : `${all.length} line(s)`
    const selected = [
      `── ${shown} — ${what}; showing the last ${win.lines.length}${win.truncated > 0 ? ` (${win.truncated} not shown)` : ''}`,
      ...win.lines,
    ].join('\n')
    process.stdout.write(budgetToolOutput({ text: selected, exitCode: 0, logPath: shown, command: 'run-logged --show' }).text)
    return 0
  } catch (error) {
    process.stdout.write(
      budgetToolOutput({
        text: `ERROR: could not select a log window: ${error?.message ?? String(error)}`,
        exitCode: 1,
        logPath: shown,
        command: 'run-logged --show',
      }).text,
    )
    return 1
  }
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
    emitRunActivity(ACTIVITY_EVENTS.VERIFICATION_FINISH, {
      at: receipt.finishedAt,
      recordPath,
      command: baseRecord.command,
      startedAt: baseRecord.startedAt,
      result: {
        exitCode,
        status: exitCode === 0 ? 'green' : 'red',
        head: receipt.head,
        branch: receipt.branch,
        framesExpected: receipt.framesExpected,
        framesWritten: receipt.framesWritten,
      },
    })
    return formatReceipt(receipt)
  } catch (err) {
    return [`── verify receipt ── unavailable (${err?.message ?? err}); the digest above and the log still stand.`]
  }
}

/**
 * THE VERIFICATION LADDER (point 1086), asked before anything is spawned.
 *
 * The rule was written down in point 595 and was therefore climbed by whoever
 * remembered it; measured 09.09.2026, one session used the full pass as its
 * debugging loop for 2.5 machine-hours on a defect two section runs then found
 * in four minutes. So the refusal sits HERE, where every run is started, rather
 * than in a document. It refuses exactly one thing — a full browser pass whose
 * cheap rung is unclimbed — and it prints the narrower command to run instead.
 *
 * Returns the verdict; the caller stops on `ok === false`.
 */
function askTheLadder() {
  const verdict = ladderCheck({
    argv: forward,
    verifyGl: process.env.VERIFY_GL,
    escape: own.noLadder === null ? null : { why: own.noLadder },
  })
  if (!verdict.ok) {
    console.log(formatLadderRefusal(verdict))
    return verdict
  }
  // A waiver is never only a printed line — it goes into the run record below
  // too — but it IS printed, because an exception nobody sees is an exception
  // nobody reconsiders.
  if (verdict.status === LADDER_STATUS.WAIVED_ESCAPE || verdict.status === LADDER_STATUS.WAIVED_NON_PREDICTIVE) {
    console.log(`# ladder waived (${verdict.status}) — ${verdict.reason}`)
  }
  return verdict
}

/** Run the regression, log all of it, print the bounded digest. */
function runVerify() {
  const ladder = askTheLadder()
  if (!ladder.ok) {
    process.exitCode = 1
    return
  }
  const logPath = logPathFor(forward, own)
  mkdirSync(dirname(logPath), { recursive: true })
  const log = createWriteStream(logPath, { flags: 'a' })
  // A LOG THAT FAILS MUST NOT KILL THE RUN (Astra review round 7). `write`
  // queues, so a filesystem error surfaces on the stream and, unhandled, throws
  // out of the process — ending a picture run that may be an hour in. It is
  // reported on stderr, where it cannot be mistaken for run output, and the run
  // goes on: losing the log is bad, losing the run is what this point is about.
  log.on('error', (err) => {
    process.stderr.write(`# the run log ${logPath} could not be written: ${err?.message ?? err}\n`)
  })
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
    cleanAtStart: cleanWorktree(ROOT),
    cacheEnvironment: cacheEnvironment(),
    log: shown,
    startedAt: started,
    expectedRuntimeMs: plan.expectedMs,
    expectedFrames: plan.expectedFrames,
    unmeasuredSuites: plan.unmeasured,
    polls: 0,
    // WHAT THE LADDER SAID ABOUT THIS RUN (point 1086) — climbed, free, or
    // waived and why. A deliberate exception that leaves no trace is one nobody
    // can weigh later.
    ladder: ladder.record,
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
  emitRunActivity(ACTIVITY_EVENTS.VERIFICATION_START, {
    at: started,
    recordPath,
    command,
    startedAt: started,
    leaseUntil: started + PROGRESS_LEASE_MS,
  })

  const child = spawn(process.execPath, [join(HERE, 'run-all.mjs'), ...forward], {
    windowsHide: true,
    cwd: ROOT,
    // stdin inherited so nothing can silently block on input; stdout/stderr piped
    // through us into the log.
    stdio: ['inherit', 'pipe', 'pipe'],
    // THE LADDER WAS ALREADY ASKED, above, with the escape this wrapper
    // consumes and does not forward. run-all asks it too — it is the entrypoint
    // the README names — so the marker keeps it to ONE question per run.
    env: { ...process.env, RVA_LADDER_ASKED: '1' },
  })

  const lines = []
  const select = createSelector()
  let rawChars = 0
  let pending = ''
  let lastProgressEmittedAt = started
  // The run's own progress mark, and the last one that was reported. A window
  // whose output repeats what the run has already said emits NOTHING, so the
  // lease behind it lapses on schedule (union entry U3).
  const progress = outputProgressState()
  let lastProgressMark = progress.mark

  // WHOSE PROGRESS IS IT (point 1137, Astra review round 1)? The WRITER's. A
  // reader that inferred progress from the record's MTIME would be fooled by its
  // own bookkeeping: `countPoll` rewrites the record, so polling a wedged run
  // renewed its apparent life for ever. The mark below is set by this process
  // alone, from what the child actually produced, and nothing a reader does can
  // move it. `--status` and `--await` read the FIELD, never the file's mtime.
  let recordedProgressAt = 0
  /** Stamp the mark, and SAY whether the run managed to say anything. */
  function markProgress(at) {
    // THE THROTTLE ADVANCES ONLY ON A WRITE THAT HAPPENED (Astra review round 3).
    // Advancing it on a write that did NOT happen would leave the last good mark
    // standing as the run's newest word about itself, and a run whose marker
    // went unwritable while it worked would be reported hung one lease later.
    if (at - recordedProgressAt < PROGRESS_RECORD_MS) return false
    if (touchProgressMark(logPath)) {
      recordedProgressAt = at
      return true
    }
    // AND A MARK THAT CANNOT BE WRITTEN FALLS BACK TO THE LOG (Astra review
    // round 6). The two live in one directory, but that does NOT make their
    // failures one: a read-only marker, or a directory that can no longer take a
    // new file, leaves the log's ALREADY OPEN descriptor writing happily. Left
    // there, a healthy silent picture suite would have gone a whole lease without
    // a sign of life and been called hung — the exact defect this point removes.
    // A `#` line is what every log parser here ignores and every reader can see.
    //
    // ONLY AT A LINE BOUNDARY (Astra review round 7). `consume` writes the
    // child's raw chunks, which end mid-line as often as not; a line pushed in
    // between would turn `FA` + `IL  polish …` into `FA# still running…` and cost
    // the saved log the very result line it exists to carry. `pending` is
    // empty exactly when the log is between lines, so the fallback waits for one.
    if (pending !== '') return false
    // AND IT IS NEVER CLAIMED AS PROVEN (Astra review round 7). `log.write`
    // queues: an ENOSPC arrives later and out of this frame's reach, so a `true`
    // here would consume the frame observation that paid for it. The throttle
    // still advances — a line a minute is the rate, failing or not — but the
    // answer is false, and what speaks for the run is the log's own mtime IF the
    // write in fact landed.
    recordedProgressAt = at
    try {
      log.write(`# still running — the progress mark ${forDisplay(progressMarkPathFor(logPath))} is not writable, so this line is the run's sign of life\n`)
    } catch {
      /* a log that cannot take a line says nothing; the stream's own error
         handler below reports it, and this run has no third place to speak */
    }
    return false
  }
  markProgress(started)

  // THE STRETCH THE OUTPUT CANNOT SEE. `run-all.mjs` captures a suite's output,
  // so between two suite lines a 55-minute `polish` says nothing at all. Its
  // FRAMES advance the whole time, so the writer samples its own frame count —
  // sampled here, by the run itself, rather than read by whoever is waiting.
  //
  // THE RESIDUAL, STATED WITHOUT A BOUND IT DOES NOT HAVE (Astra review rounds 1,
  // 4 and 5). Frames carry NO run identity — `verification/` is shared and
  // `framesWrittenSince` says so — so another verify run's pictures raise this
  // sample too. A run that is genuinely WEDGED keeps this wrapper and this
  // sampler alive, and a succession of other runs taking pictures can keep its
  // mark moving for as long as they last. Round 5 is right that nothing corrects
  // that from inside: a wedged run never produces a real mark of its own. So the
  // hung verdict can be DELAYED, for as long as somebody else keeps
  // photographing.
  //
  // It is kept anyway, deliberately. The defect this point exists for is the
  // opposite one and is not hypothetical: healthy runs were ENDED, twice in one
  // evening, and the release stood behind the covering run they would have
  // produced. Between a detector that occasionally fires late and one that
  // reliably kills the thing it watches, this project has already paid for the
  // second. Closing it properly needs a frame that names its run — a change to
  // every suite's shutter, not to this file — and until then the reader's own
  // verdict (run-record.mjs) touches nothing another run could have written.
  //
  // BY MTIME, NOT BY COUNT (Astra review round 2). `framesWrittenSince` counts
  // DISTINCT names on purpose — a both-backends run photographs the same 93
  // files twice — so on the second backend pass, and on every retry, the count
  // stops rising while the pictures keep coming. A run producing frames the
  // whole time would have gone silent for a whole suite and been called hung.
  let frameMark = newestFrameMtimeMs({ since: started }) ?? 0
  const frameTick = baseRecord.expectedFrames > 0
    ? setInterval(() => {
      const now = newestFrameMtimeMs({ since: started })
      // AN OBSERVATION IS CONSUMED ONLY WHEN IT HAS BEEN RECORDED (Astra review
      // round 5). Advancing `frameMark` before the stamp meant a throttled or
      // failed write threw the observation away: the next tick saw the same
      // newest frame, took it for no progress, and only a LATER frame could
      // ever try again. The mark now moves with the write, so a tick that could
      // not record retries on the next one.
      if (typeof now === 'number' && now > frameMark && markProgress(Date.now())) frameMark = now
    }, FRAME_SAMPLE_MS)
    : null
  frameTick?.unref?.()

  function consume(chunk) {
    const text = String(chunk)
    rawChars += text.length
    log.write(text)
    const progressAt = Date.now()
    advanceOutputProgress(progress, text)
    markProgress(progressAt)
    if (progress.mark !== lastProgressMark && progressAt - lastProgressEmittedAt >= PROGRESS_EMIT_MS) {
      lastProgressEmittedAt = progressAt
      lastProgressMark = progress.mark
      emitRunActivity(ACTIVITY_EVENTS.VERIFICATION_PROGRESS, {
        at: progressAt,
        recordPath,
        command,
        startedAt: started,
        leaseUntil: progressAt + PROGRESS_LEASE_MS,
        value: progress.mark,
      })
    }
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
    if (frameTick) clearInterval(frameTick)
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
    const receipt = closeRecord({ lines, exitCode, started, recordPath, baseRecord })
    const endBlock = `${[digest.text, ...receipt].join('\n')}\n`
    process.stdout.write(
      budgetToolOutput({
        text: endBlock,
        exitCode,
        logPath: shown,
        command: 'run-logged verify digest',
      }).text,
    )
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

const { own, forward } = parseRunLoggedArgs(process.argv.slice(2))
if (own.show) process.exitCode = showLog(own.show)
else {
  const refusal = developmentRunRefusal(forward, own)
  if (refusal) {
    console.log(refusal)
    process.exitCode = 1
  } else {
    const cached = findGreenReceipt({
      dir: join(ROOT, process.env.VERIFY_LOG_DIR || 'local/verify-logs'),
      argv: forward, head: gitPosition().head, verifyGl: process.env.VERIFY_GL,
      environment: cacheEnvironment(),
      again: own.again, clean: cleanWorktree(ROOT),
    })
    if (cached) console.log(formatCachedGreen({ ...cached, path: forDisplay(cached.path) }))
    else {
      await waitForLargeRun()
      if (own.logFile) runVerify()
      else reexecWithLogPath()
    }
  }
}
