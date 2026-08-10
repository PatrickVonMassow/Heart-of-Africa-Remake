// AWAITING A RUN INSTEAD OF POLLING IT (point 592) — the pure decision half.
//
// WHY: measured over six days (09.08.2026), waiting cost more than any other
// single habit in this project. 2857 responses were poll answers (10.9 % of the
// weighted spend) and another 1189 were bare idle holders (3.6 %); the longest
// unbroken poll chain was 437 responses for a result that is one word. One
// 42-minute LARGE run polled every 30 s costs ~1.9 M weighted for the loop
// alone. Nothing about that loop is work: it re-reads a log that has not
// changed to learn a fact the process will announce by itself.
//
// THE RULE THIS MODULE ENCODES:
//   1. A long run is AWAITED, not polled — either through the harness'
//      completion notification (a background run announces its own exit) or
//      through ONE blocking call with a timeout.
//   2. Where a poll is genuinely unavoidable, the FIRST wait is 0.9 × the
//      suite's MEASURED median runtime, not 30 s. The medians are below and
//      come from docs/picture-check-cost.md §1 — the same table, pinned by
//      run-wait-core.test.mjs so the two cannot drift apart.
//   3. After MAX_POLLS the run is either awaited blocking or treated as HUNG.
//      No third option: 13 chains of ten or more polls carried 4.9 % of the
//      whole window's spend.
//   4. The count is PRINTED, not remembered. `run-wait.mjs --status` is the one
//      counted poll and the verify wrapper prints the total in its receipt, so
//      the rule is visible in the transcript rather than trusted.
//
// Everything here is data-in / data-out so the Vitest layer can pin it; all
// process work — the record file, the frame scan, the blocking wait — lives in
// run-wait.mjs and run-logged.mjs.
import { parseArgs, planBackends, selectBackend, suitesFor } from './tiers.mjs'

/**
 * MEASURED median wall clock per suite, in SECONDS, on the WebGL 2 lane —
 * verbatim from docs/picture-check-cost.md §1 ("Per suite: screenshots, bytes,
 * runtime"). Several rest on a single observation, which is why they are a
 * planning figure and never an assertion: they size a WAIT, and a wait that is
 * 20 % short costs one more check, not a wrong verdict.
 *
 * Keep in lockstep with that table — run-wait-core.test.mjs parses the document
 * and fails when a number here no longer matches it.
 */
export const SUITE_RUNTIME_S = Object.freeze({
  enrichments: 951.1,
  polish: 340.9,
  flow: 140.4,
  world: 73.1,
  i18n: 34.4,
  handwriting: 34.9,
  settings: 194.2,
  voice: 120.1,
  collision: 66.5,
  benchmark: 133.8,
  health: 61.8,
  preview: 29.0,
  events: 46.1,
  gamepad: 67.6,
  invariants: 167.0,
  touch: 75.1,
})

/**
 * How many FRAMES a passing run of each suite writes — the same table's shot
 * column. This is the half point 375 could not see: its shutter refuses a frame
 * whose subject is missing, but a frame that was never written AT ALL goes
 * unnoticed, and a run that photographs 60 of its 93 frames exits 0 today.
 * Awaiting instead of polling is the moment to make the run state one checkable
 * object, so the receipt carries expected-against-written.
 */
export const SUITE_FRAMES = Object.freeze({
  enrichments: 37,
  polish: 21,
  flow: 8,
  world: 8,
  i18n: 5,
  handwriting: 3,
  settings: 3,
  voice: 3,
  collision: 2,
  benchmark: 1,
  health: 1,
  preview: 1,
  events: 0,
  gamepad: 0,
  invariants: 0,
  touch: 0,
})

/**
 * Suites the cost measurement never recorded: `docs` is a pure Node check that
 * opens no browser (the recorder never logs it), and `startup`/`report`/
 * `crossbrowser` predate the recording window. They are NAMED rather than
 * silently treated as zero — an estimate that quietly omits a suite is how a
 * wait comes out too short and the poll loop returns.
 */
export const UNMEASURED_SUITES = Object.freeze(['docs', 'startup', 'report', 'crossbrowser'])

/** The first wait is 0.9 × the measured median: long enough that the run is
 *  almost always over, short enough that it is not idling past the end. */
export const FIRST_WAIT_FRACTION = 0.9

/** Every wait after the first, as a fraction of the expected runtime. */
export const FOLLOW_WAIT_FRACTION = 0.1

/** No wait shorter than this — a one-second re-check is a poll with a new name. */
export const MIN_WAIT_MS = 10_000

/** After this many counted polls the run is awaited blocking or called hung. */
export const MAX_POLLS = 5

/** Past this multiple of the expected runtime a run is HUNG, not slow. */
export const HUNG_FACTOR = 2.5

/**
 * The longest a single blocking call may run here. The harness caps a shell
 * call at 600 s, so anything longer than this CANNOT be a blocking call and
 * must ride on the background run's completion notification instead. Kept just
 * under the cap so the call reports its own timeout rather than being killed.
 */
export const BLOCKING_LIMIT_MS = 590_000

/** Milliseconds a suite is expected to take, or null when it was never measured. */
export function suiteRuntimeMs(suite) {
  const s = SUITE_RUNTIME_S[String(suite ?? '')]
  return Number.isFinite(s) ? Math.round(s * 1000) : null
}

/** Frames a passing run of this suite writes, or null when it was never measured. */
export function suiteFrames(suite) {
  const n = SUITE_FRAMES[String(suite ?? '')]
  return Number.isFinite(n) ? n : null
}

/**
 * What a run of these suites is expected to cost, and which of them nobody has
 * measured. `passes` is the number of backend passes the command plans: the
 * second pass of a both-backends LARGE run repeats the render suites, so its
 * time adds while its FRAMES do not (they overwrite the same files).
 */
export function expectedRuntimeMs(suites = [], { passes = 1 } = {}) {
  const list = [...new Set((suites ?? []).map((s) => String(s)))]
  let ms = 0
  const unmeasured = []
  for (const s of list) {
    const one = suiteRuntimeMs(s)
    if (one === null) unmeasured.push(s)
    else ms += one
  }
  return { ms: ms * Math.max(1, passes), unmeasured, measured: list.length - unmeasured.length }
}

/**
 * How many DISTINCT frame files a run of these suites should leave behind.
 * Distinct, not written: a both-backends run photographs the same names twice,
 * so counting writes would demand 182 files where 93 exist.
 */
export function expectedFrames(suites = []) {
  const list = [...new Set((suites ?? []).map((s) => String(s)))]
  let frames = 0
  const unmeasured = []
  for (const s of list) {
    const one = suiteFrames(s)
    if (one === null) unmeasured.push(s)
    else frames += one
  }
  return { frames, unmeasured }
}

/**
 * WHAT THIS INVOCATION WILL ACTUALLY RUN, and what that is expected to cost.
 *
 * The suite→tier→backend map is `tiers.mjs` and stays the single source of it:
 * a receipt that listed a different suite set from the one the runner drives
 * would be a second truth, and this project has paid for those. `argv` is the
 * runner's own argument list, `verifyGl` the pinned backend (undefined means
 * unpinned, which is what makes a LARGE run cover both).
 *
 * Time adds per PASS (the second backend pass repeats the render suites);
 * frames do NOT (it overwrites the same files), so they are counted over the
 * union.
 */
export function planRun({ argv = [], verifyGl } = {}) {
  const { tier, filter, fullRun, isLargeEquivalent } = parseArgs(argv)
  const plan = planBackends({ isLargeEquivalent, verifyGl, ranBoth: false })
  const passes =
    plan.length > 0
      ? plan.map((p) => ({
          backend: p.backend,
          skipPreflight: p.skipPreflight,
          suites: suitesFor({ tier, filter, backend: p.backend, webglOnlyCovered: p.webglOnlyCovered }),
        }))
      : [
          {
            backend: selectBackend(verifyGl),
            skipPreflight: false,
            suites: suitesFor({ tier, filter, backend: selectBackend(verifyGl) }),
          },
        ]
  // The prod-preview smoke is not one of the DEV suites: it runs on the LARGE/
  // default tier only, and only on a pass that did not skip the preflight.
  const wantsPreview = (fullRun && tier !== 'small') || filter.includes('preview')
  let ms = 0
  const unmeasured = new Set()
  for (const pass of passes) {
    const withPreview = wantsPreview && !pass.skipPreflight ? [...pass.suites, 'preview'] : pass.suites
    const cost = expectedRuntimeMs(withPreview)
    ms += cost.ms
    for (const u of cost.unmeasured) unmeasured.add(u)
  }
  const union = [...new Set(passes.flatMap((p) => p.suites))]
  if (wantsPreview) union.push('preview')
  const frames = expectedFrames(union)
  return {
    tier,
    filter,
    passes,
    backends: passes.map((p) => p.backend),
    suites: union,
    expectedMs: ms,
    expectedFrames: frames.frames,
    unmeasured: [...unmeasured],
  }
}

/**
 * How long to wait BEFORE looking again — the whole point of the measured
 * medians. The first wait consumes 0.9 of the expected runtime (minus whatever
 * has already elapsed), every later one a tenth of it. Never below MIN_WAIT_MS,
 * and never past what is left of the blocking budget.
 */
export function nextWaitMs({ polls = 0, expectedMs = null, elapsedMs = 0, limitMs = BLOCKING_LIMIT_MS } = {}) {
  const expected = Number.isFinite(expectedMs) && expectedMs > 0 ? expectedMs : null
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  let want
  if (expected === null) want = MIN_WAIT_MS
  else if (polls <= 0) want = Math.round(expected * FIRST_WAIT_FRACTION) - elapsed
  else want = Math.round(expected * FOLLOW_WAIT_FRACTION)
  return Math.max(MIN_WAIT_MS, Math.min(want, limitMs))
}

/**
 * THE POLL BUDGET. `running:false` ends it; past HUNG_FACTOR × expected the run
 * is hung rather than slow; at MAX_POLLS the loop is over either way. Returns
 * the verdict and the sentence that says what to do instead — the message is
 * part of the decision because a budget nobody is told about is a counter.
 */
export function pollBudget({
  polls = 0,
  running = true,
  expectedMs = null,
  elapsedMs = null,
  maxPolls = MAX_POLLS,
} = {}) {
  const count = Number.isFinite(polls) && polls > 0 ? Math.floor(polls) : 0
  const expected = Number.isFinite(expectedMs) && expectedMs > 0 ? expectedMs : null
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null
  const remaining = Math.max(0, maxPolls - count)
  if (!running) {
    return { verdict: 'finished', polls: count, remaining, message: 'the run is over — read its receipt, do not poll again.' }
  }
  if (expected !== null && elapsed !== null && elapsed > expected * HUNG_FACTOR) {
    return {
      verdict: 'hung',
      polls: count,
      remaining,
      message:
        `HUNG: ${formatDuration(elapsed)} elapsed against an expected ${formatDuration(expected)} ` +
        `(more than ${HUNG_FACTOR}×). Treat it as hung: read the log's tail, kill it, and start again — ` +
        'do not keep waiting.',
    }
  }
  if (remaining === 0) {
    return {
      verdict: 'exhausted',
      polls: count,
      remaining,
      message:
        `POLL BUDGET SPENT (${count}/${maxPolls}). Stop looking: either await it blocking ` +
        '(`node scripts/verify/run-wait.mjs --await`) or treat it as hung and end it. A sixth poll buys nothing.',
    }
  }
  return {
    verdict: 'poll',
    polls: count,
    remaining,
    message:
      `poll ${count}/${maxPolls}${remaining === 1 ? ' — this is the LAST one' : ''}; ` +
      `next look in ${formatDuration(nextWaitMs({ polls: count, expectedMs: expected, elapsedMs: elapsed ?? 0 }))}, ` +
      'or stop looking and await it blocking.',
  }
}

/**
 * SHOULD THIS RUN BE AWAITED IN THE FOREGROUND, OR RIDE ON THE NOTIFICATION?
 * The one question a caller has to answer BEFORE it starts the run, and the
 * reason a 42-minute LARGE run cannot simply be blocked on: the harness caps a
 * shell call at 600 s, so past BLOCKING_LIMIT_MS the completion notification of
 * a background run is the only mechanism that carries.
 */
export function waitPlan({ expectedMs = null, limitMs = BLOCKING_LIMIT_MS } = {}) {
  const expected = Number.isFinite(expectedMs) && expectedMs > 0 ? expectedMs : null
  if (expected === null) {
    return {
      shape: 'background',
      expectedMs: null,
      message:
        'nothing measured for this selection — launch it in the BACKGROUND and let the completion ' +
        'notification carry it; do not invent a poll interval.',
    }
  }
  if (expected <= limitMs) {
    return {
      shape: 'blocking',
      expectedMs: expected,
      timeoutMs: Math.min(limitMs, Math.round(expected * 1.5) + 30_000),
      message:
        `expected ${formatDuration(expected)} — run it in the FOREGROUND as ONE blocking call ` +
        `(timeout ${formatDuration(Math.min(limitMs, Math.round(expected * 1.5) + 30_000))}). No polling.`,
    }
  }
  return {
    shape: 'background',
    expectedMs: expected,
    timeoutMs: limitMs,
    message:
      `expected ${formatDuration(expected)} — longer than the ${formatDuration(limitMs)} a single blocking call ` +
      'may take, so launch it in the BACKGROUND and let the harness completion notification announce the exit. ' +
      'Then read the receipt (`node scripts/verify/run-wait.mjs --receipt`).',
  }
}

/** `4m 12s`, `38s` — the same shape run-digest-core.mjs prints durations in. */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '?'
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/** `===== LARGE regression — backend 1/2: WebGL 2 (…) =====` */
const BACKEND_BANNER = /^={3,}\s*LARGE regression\s+—\s+backend\s+\d+\/\d+:\s*(WebGPU|WebGL 2)/

const BACKEND_LABEL = Object.freeze({ webgpu: 'WebGPU', webgl: 'WebGL 2' })

/**
 * WHICH BACKEND(S) DID THIS RUN ACTUALLY COVER? Read from the run's own banners
 * where it printed them (a both-backends LARGE re-invokes itself once per pass),
 * and from VERIFY_GL otherwise. A receipt that guessed the backend would be
 * worse than one that admits it does not know, so an unreadable case answers an
 * empty list.
 */
export function backendsFrom({ lines = [], verifyGl = null, fallback = null } = {}) {
  const seen = []
  for (const raw of lines ?? []) {
    const m = BACKEND_BANNER.exec(String(raw ?? ''))
    if (m && !seen.includes(m[1])) seen.push(m[1])
  }
  if (seen.length > 0) return seen
  const pinned = String(verifyGl ?? '').trim().toLowerCase()
  if (pinned === 'webgpu' || pinned === 'webgl') return [BACKEND_LABEL[pinned]]
  const fb = String(fallback ?? '').trim().toLowerCase()
  if (fb === 'webgpu' || fb === 'webgl') return [BACKEND_LABEL[fb]]
  return []
}

/**
 * DID THE RUN WRITE THE PICTURES IT OWES? `expected` is null wherever the suite
 * selection contains something unmeasured — an unknown expectation is reported
 * as unknown and never as satisfied.
 */
export function framesVerdict({ expected = null, written = null } = {}) {
  const exp = Number.isFinite(expected) ? expected : null
  const got = Number.isFinite(written) ? written : null
  if (exp === null || got === null) {
    return { status: 'unknown', expected: exp, written: got, message: 'frames: not comparable (no measured expectation)' }
  }
  if (got === exp) return { status: 'ok', expected: exp, written: got, message: `frames: ${got}/${exp}` }
  if (got < exp) {
    return {
      status: 'short',
      expected: exp,
      written: got,
      message:
        `frames: ${got}/${exp} — ${exp - got} FRAME(S) MISSING. The shutter refuses a mis-aimed frame ` +
        '(point 375) but a frame never written at all is silent; find which suite stopped short.',
    }
  }
  return {
    status: 'extra',
    expected: exp,
    written: got,
    message: `frames: ${got}/${exp} — ${got - exp} MORE than the measured expectation; the table in docs/picture-check-cost.md §1 is behind.`,
  }
}

/**
 * THE COMPLETION RECEIPT — a structured object, not prose. Every field is one a
 * reader of a finished run has to have: what it exited with, which backend and
 * which suites it covered, the commit it ran on, where the whole output is, the
 * failing units UNCUT (a truncated failure list is how a second run gets
 * started), and the frames expected against the frames written.
 */
export function buildReceipt({
  command = '',
  tier = null,
  suites = [],
  backends = [],
  head = null,
  branch = null,
  logPath = '',
  exitCode = null,
  startedAt = null,
  finishedAt = null,
  durationMs = null,
  polls = 0,
  failing = [],
  framesExpected = null,
  framesWritten = null,
} = {}) {
  const duration = Number.isFinite(durationMs)
    ? durationMs
    : Number.isFinite(startedAt) && Number.isFinite(finishedAt)
      ? finishedAt - startedAt
      : null
  return {
    command,
    tier,
    suites: [...(suites ?? [])],
    backends: [...(backends ?? [])],
    head,
    branch,
    logPath,
    exitCode,
    green: exitCode === 0 && (failing ?? []).length === 0,
    startedAt,
    finishedAt,
    durationMs: duration,
    polls: Number.isFinite(polls) && polls > 0 ? Math.floor(polls) : 0,
    failing: (failing ?? []).map((f) => ({ name: String(f?.name ?? '?'), details: [...(f?.details ?? [])].map(String) })),
    frames: framesVerdict({ expected: framesExpected, written: framesWritten }),
  }
}

/**
 * The receipt as lines. Deliberately about ten of them on a green run — the
 * point of awaiting instead of polling is that the ONE thing that reaches the
 * session is this, and a reader must not have to open the log to learn whether
 * the run passed, what it covered, or which commit it covered it on.
 *
 * The failing block is the exception to every bound in this project's output
 * discipline: the names go out UNCUT. A digest that hides half a failure list
 * costs a whole rerun.
 */
export function formatReceipt(receipt) {
  const r = receipt ?? {}
  const out = []
  const verdict = r.exitCode === 0 ? 'GREEN' : 'RED'
  out.push(
    `── verify receipt ── ${r.command || 'verify run'} ── ${verdict} (exit ${r.exitCode ?? '?'})` +
      `${r.durationMs === null || r.durationMs === undefined ? '' : ` after ${formatDuration(r.durationMs)}`}`,
  )
  out.push(`   suites:  ${r.suites?.length ? r.suites.join(', ') : '(none recorded)'}${r.tier ? ` [tier ${r.tier}]` : ''}`)
  out.push(`   backend: ${r.backends?.length ? r.backends.join(' + ') : 'UNKNOWN — the run printed none and VERIFY_GL was unset'}`)
  out.push(`   HEAD:    ${r.head ?? 'unknown'}${r.branch ? ` (${r.branch})` : ''}`)
  out.push(`   log:     ${r.logPath || '(no log file)'}`)
  out.push(`   ${r.frames?.message ?? 'frames: unknown'}`)
  out.push(`   polls:   ${r.polls ?? 0}${(r.polls ?? 0) === 0 ? ' (awaited, not polled)' : ` of ${MAX_POLLS}`}`)
  if ((r.failing ?? []).length === 0) {
    out.push('   failing: none')
  } else {
    out.push(`   failing (${r.failing.length}), uncut:`)
    for (const f of r.failing) {
      out.push(`     ${f.name}`)
      for (const d of f.details) out.push(`       ${d}`)
    }
  }
  return out
}
