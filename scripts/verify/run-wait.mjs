// AWAIT A VERIFY RUN — the one command that replaces the poll loop (point 592).
//
// The measurement that produced this: 2857 responses in six days were polls
// (10.9 % of the weighted spend), 1189 more were bare idle holders (3.6 %), and
// the longest unbroken poll chain was 437 responses. A 42-minute LARGE run
// polled every 30 s spends ~1.9 M weighted on the loop alone — for a result
// that is one word.
//
// USE IT LIKE THIS:
//   node scripts/verify/run-wait.mjs --plan large
//       Before you start anything: what the run is expected to cost, and
//       whether it may be a blocking call at all or has to go to the background
//       and ride on the harness completion notification.
//   node scripts/verify/run-wait.mjs --await [<log>] [--timeout <s>]
//       ONE blocking call. It returns when the run is over and prints the
//       receipt. It counts as no poll, because nobody looked.
//   node scripts/verify/run-wait.mjs --receipt [<log>]
//       The receipt of a finished run, again. Free, and no poll either.
//   node scripts/verify/run-wait.mjs --status [<log>]
//       The one COUNTED poll. Use it only where awaiting is genuinely
//       impossible; it prints how many are left and what to do instead.
//
// With no <log> every mode resolves the newest run record in the log directory,
// which is the ordinary case: the session has just started one run.
import { setTimeout as delay } from 'node:timers/promises'
import { isAbsolute, join, relative } from 'node:path'
import {
  MAX_POLLS,
  backendsFrom,
  buildReceipt,
  formatDuration,
  formatReceipt,
  nextWaitMs,
  planRun,
  pollBudget,
  waitPlan,
} from './run-wait-core.mjs'
import {
  ROOT,
  activeRecordPath,
  countPoll,
  elapsedMs,
  logDir,
  readRecord,
  recordPathFor,
  runIsLive,
} from './run-record.mjs'

const USAGE = [
  'usage:',
  '  node scripts/verify/run-wait.mjs --plan [large|small|<suite>…]   what it will cost, and how to wait for it',
  '  node scripts/verify/run-wait.mjs --await [<log>] [--timeout <s>] block until it is over, then the receipt',
  '  node scripts/verify/run-wait.mjs --receipt [<log>]               the receipt of a finished run',
  '  node scripts/verify/run-wait.mjs --status [<log>]                ONE counted poll (last resort)',
].join('\n')

/** How often the blocking wait looks at the record. Not a poll in the sense
 *  this point is about — no model turn happens, no context is spent; it is the
 *  inside of a single call that is already blocking. */
const TICK_MS = 2000

function forDisplay(path) {
  const rel = relative(ROOT, path)
  return rel && !rel.startsWith('..') ? rel.replace(/\\/g, '/') : path
}

/** The record this invocation is about: the named log's, or the newest one. */
function resolveRecord(logArg) {
  if (logArg) {
    const path = recordPathFor(isAbsolute(logArg) ? logArg : join(ROOT, logArg))
    return { path, record: readRecord(path) }
  }
  // The newest LIVE run, not merely the newest: a quick suite that finished
  // beside a running LARGE must not become "the run" (four-eyes finding 2).
  const path = activeRecordPath(logDir())
  return { path, record: path ? readRecord(path) : null }
}

/**
 * The exit code a CALLER gets. A run whose wrapper was killed leaves no exit
 * code at all, and answering 0 for it would report success for a run that
 * proved nothing (four-eyes finding 3) — an unknown outcome is a failure.
 */
function exitOf(record) {
  return Number.isFinite(record?.exitCode) ? record.exitCode : 1
}

function noRecord(path) {
  console.log(
    `no verify run record${path ? ` at ${forDisplay(path)}` : ` in ${forDisplay(logDir())}`}. A run started through ` +
      '`npm test` / `npm run test:small` / `npm run test:large` writes one beside its log; a suite started by hand ' +
      'does not. Start it through the wrapper (scripts/verify/run-logged.mjs) and this command can await it.',
  )
  return 2
}

/** The receipt as the record carries it, or one rebuilt from what is known. */
function receiptOf(record) {
  if (record?.receipt) return record.receipt
  return buildReceipt({
    command: record?.command ?? '',
    tier: record?.tier ?? null,
    suites: record?.suites ?? [],
    backends: backendsFrom({ lines: [], verifyGl: record?.verifyGl, fallback: record?.backends }),
    head: record?.head ?? null,
    branch: record?.branch ?? null,
    logPath: record?.log ?? '',
    exitCode: record?.exitCode ?? null,
    startedAt: record?.startedAt ?? null,
    finishedAt: record?.finishedAt ?? null,
    polls: record?.polls ?? 0,
  })
}

function printReceipt(record) {
  for (const line of formatReceipt(receiptOf(record))) console.log(line)
}

/** `--plan`: the decision that belongs BEFORE the run, not after it. */
function doPlan(argv) {
  const plan = planRun({ argv, verifyGl: process.env.VERIFY_GL })
  const how = waitPlan({ expectedMs: plan.expectedMs })
  console.log(`# plan: ${plan.suites.length} suite(s) over ${plan.passes.length} backend pass(es) — ${plan.backends.join(' + ')}`)
  console.log(`  suites:   ${plan.suites.join(', ') || '(none)'}`)
  console.log(`  expected: ${formatDuration(plan.expectedMs)} (measured medians, docs/picture-check-cost.md §1)`)
  console.log(`  frames:   ${plan.expectedFrames} expected`)
  if (plan.unmeasured.length > 0) {
    console.log(`  runtime never measured for (so not in the time above): ${plan.unmeasured.join(', ')}`)
  }
  if (plan.framesUnmeasured?.length > 0) console.log(`  frame count unknown for: ${plan.framesUnmeasured.join(', ')}`)
  console.log(`  HOW TO WAIT: ${how.message}`)
  if (how.shape === 'blocking') {
    console.log(`  first look after ${formatDuration(nextWaitMs({ polls: 0, expectedMs: plan.expectedMs }))} if you must look at all.`)
  }
  return 0
}

/** `--await`: ONE blocking call. Returns the run's own exit code. */
async function doAwait(logArg, timeoutS) {
  const { path, record } = resolveRecord(logArg)
  if (!record) return noRecord(path)
  const live = runIsLive(record)
  if (!live.live) {
    const fresh = readRecord(path) ?? record
    console.log(`# the run is already over (${live.reason}) — no waiting was needed.`)
    printReceipt(fresh)
    return exitOf(fresh)
  }
  const budget = Number.isFinite(timeoutS) && timeoutS > 0
    ? timeoutS * 1000
    : (waitPlan({ expectedMs: record.expectedRuntimeMs ?? null }).timeoutMs ?? 590_000)
  console.log(
    `# awaiting ${record.command ?? 'the run'} (pid ${record.pid ?? '?'}) — expected ` +
      `${formatDuration(record.expectedRuntimeMs ?? null)}, giving it ${formatDuration(budget)}. Nothing is being polled.`,
  )
  const deadline = Date.now() + budget
  let current = record
  while (Date.now() < deadline) {
    await delay(TICK_MS)
    current = readRecord(path) ?? current
    if (!runIsLive(current).live) {
      printReceipt(current)
      return exitOf(current)
    }
  }
  const waited = elapsedMs(current) ?? budget
  console.log(
    `STILL RUNNING after ${formatDuration(waited)} — this call's ${formatDuration(budget)} is spent, the run is not. ` +
      'Do NOT start a poll loop: let the background run\'s completion notification announce the exit, then read ' +
      `\`node scripts/verify/run-wait.mjs --receipt ${forDisplay(record.log ?? '')}\`. If nothing arrives and the ` +
      'elapsed time passes 2.5x the expectation, treat it as hung.',
  )
  return 3
}

/** `--status`: the one COUNTED poll, and it says what it costs. */
function doStatus(logArg) {
  const { path, record } = resolveRecord(logArg)
  if (!record) return noRecord(path)
  const live = runIsLive(record)
  if (!live.live) {
    const fresh = readRecord(path) ?? record
    console.log(`# finished (${live.reason}) — not counted as a poll.`)
    printReceipt(fresh)
    return exitOf(fresh)
  }
  const counted = countPoll(path) ?? record
  const verdict = pollBudget({
    polls: counted.polls,
    running: true,
    expectedMs: counted.expectedRuntimeMs ?? null,
    elapsedMs: elapsedMs(counted),
  })
  console.log(
    `RUNNING  ${counted.command ?? '?'} — ${formatDuration(elapsedMs(counted))} elapsed of an expected ` +
      `${formatDuration(counted.expectedRuntimeMs ?? null)} (log ${forDisplay(counted.log ?? '')})`,
  )
  console.log(`POLLS    ${counted.polls} of ${MAX_POLLS} — ${verdict.message}`)
  return verdict.verdict === 'hung' ? 4 : 0
}

/** `--receipt`: free, and never a poll. */
function doReceipt(logArg) {
  const { path, record } = resolveRecord(logArg)
  if (!record) return noRecord(path)
  if (runIsLive(record).live) {
    console.log('# the run is NOT over — this is the receipt of a run in progress, and it is incomplete.')
  }
  printReceipt(record)
  return exitOf(record)
}

async function main(argv) {
  const mode = argv[0]
  const rest = argv.slice(1)
  const timeoutIndex = rest.indexOf('--timeout')
  const timeoutS = timeoutIndex >= 0 ? Number(rest[timeoutIndex + 1]) : null
  const positional = rest.filter((a, i) => !a.startsWith('--') && !(timeoutIndex >= 0 && i === timeoutIndex + 1))
  if (mode === '--plan') return doPlan(positional)
  if (mode === '--await') return doAwait(positional[0] ?? null, timeoutS)
  if (mode === '--status') return doStatus(positional[0] ?? null)
  if (mode === '--receipt') return doReceipt(positional[0] ?? null)
  console.log(USAGE)
  return mode === undefined || mode === '--help' ? 0 : 2
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (err) => {
    console.log(`run-wait: ${err?.message ?? err}`)
    process.exitCode = 1
  },
)
