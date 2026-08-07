// Mechanical evidence that a verify suite REALLY ran on a given renderer
// backend (point 210's lesson: the sea-coast fix was called done after a
// WebGL2-only check while the user's WebGPU picture was still broken). Armed by
// scripts/verify/_browser.mjs the moment a suite launches its browser; on
// process exit it appends a run record — backend, suite name, exit code,
// whether assertBackend confirmed the backend, and the screenshots the run
// actually wrote — to .claude/render-verify-state.json. The Stop-hook
// render-verify-guard.mjs judges dual-backend coverage from these records, so
// "I ran it" can never be a hollow claim: the record only exists when the suite
// process itself wrote it.
//
// A RED run is recorded with its REDS (point 550): every failing check and
// console error it printed, each charged to the open work-order point that owns
// it (scripts/render-verify-charges.mjs) or to nothing. That is what lets the
// guard accept a run whose reds all belong to other points while still recording
// it as ACCOUNTED FOR rather than as a pass — see runVerdict in
// render-verify-core.mjs. Charging happens HERE, at record time, so the record
// says what was charged and no later ledger edit can bless a finished run.
//
// Observe-only and total: every step is wrapped so the bookkeeping can NEVER
// fail a verify suite.
import { basename, join, resolve } from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { recordRun } from './render-verify-state.mjs'
import { failedChecks } from './verify/baseline-classify-core.mjs'
import { chargeReds } from './render-verify-core.mjs'

// Resolved from this module's own location where that is possible, with a
// working-directory fallback: under the test runner `import.meta.url` is not
// always a file: URL, and a module that throws at IMPORT time takes its whole
// consumer down (tasks-source.mjs carries the same guard for the same reason).
const SCREENSHOT_DIR = (() => {
  try {
    return fileURLToPath(new URL('../verification', import.meta.url))
  } catch {
    return resolve(process.cwd(), 'verification')
  }
})()

/** Result lines worth keeping for the red accounting (point 550): a suite's own
 *  `FAIL  <name> — <detail>`, the `ERR: <text>` console-error lines, and the
 *  `console errors: <texts>` summary where it carries texts rather than a count.
 *  PASS lines are dropped — nothing downstream reads them, and a suite prints
 *  thousands. baseline-classify-core.mjs then parses exactly what it parses in
 *  the triage lane, so the two can never drift into different readings of a red. */
const KEPT_LINE = /^(?:FAIL\s{2,}|ERR:|console errors:|CONSOLE ERRORS:)/

/** A cap, because the buffer lives for the whole run: 400 result lines is far
 *  more than any suite's failing half and bounds the memory either way. */
const MAX_KEPT_LINES = 400

/** How many charged reds one record keeps — a bound on the state file, which
 *  holds 40 runs. See the sort below: only a CHARGED red is ever dropped. */
const MAX_RECORDED_REDS = 60

/** Stderr that says the process did not end on its own terms — a stack frame or
 *  a bare `…Error:` headline. A run that CRASHED explains nothing about the
 *  picture, however many of its reds are charged, so it never counts as
 *  accounted for. A false positive only makes the gate stricter. */
const CRASH_LINE = /^\s+at .+:\d+:\d+|^(?:Uncaught\s+)?\w*Error(?::|\b)/

let armed = null

/**
 * Tap the run's OWN output for its result lines. The stream is tapped rather
 * than `console`, because a crash is printed by NODE ITSELF straight to stderr
 * and never passes through console.error — and that is the case the accounting
 * must not mistake for a reported failure.
 *
 * Observe-only and total: the original write is ALWAYS called with the original
 * arguments and its return value passed straight back, and a throw in the
 * collector can never reach the suite. Installed at browser launch, so a red
 * printed before that (there is none today) would not be seen — which errs
 * toward blocking, not toward clearing.
 */
export function tapOutput(state, streams = [[process.stdout, false], [process.stderr, true]]) {
  const pending = new Map()
  const take = (stream, isErr, text) => {
    const lines = ((pending.get(stream) ?? '') + text).split('\n')
    pending.set(stream, lines.pop() ?? '')
    for (const line of lines) {
      if (isErr && CRASH_LINE.test(line)) state.crashed = true
      if (!KEPT_LINE.test(line)) continue
      if (state.lines.length < MAX_KEPT_LINES) state.lines.push(line)
      else state.dropped = (state.dropped ?? 0) + 1
    }
  }
  const isErrOf = new Map(streams)
  for (const [stream, isErr] of streams) {
    const original = stream.write.bind(stream)
    stream.write = (chunk, ...rest) => {
      try {
        take(stream, isErr, typeof chunk === 'string' ? chunk : (chunk?.toString?.('utf8') ?? ''))
      } catch {
        /* never let the bookkeeping disturb the suite's own output */
      }
      return original(chunk, ...rest)
    }
  }
  /** The last line of a stream carries no newline when a process dies mid-write;
   *  flushing at exit is what makes that line readable at all. */
  return () => {
    for (const stream of [...pending.keys()]) {
      if (!pending.get(stream)) continue
      // The appended newline turns the remainder into a whole line for `take`,
      // which then clears it.
      take(stream, isErrOf.get(stream) === true, '\n')
    }
  }
}

/** Screenshot files written since the run started — the "it rendered" evidence. */
function screenshotsSince(startedAt) {
  const names = []
  try {
    for (const f of readdirSync(SCREENSHOT_DIR)) {
      if (!f.endsWith('.png')) continue
      try {
        if (statSync(join(SCREENSHOT_DIR, f)).mtimeMs >= startedAt) names.push(f)
      } catch {
        /* racing writer — skip this file */
      }
    }
  } catch {
    /* no screenshot dir — a non-screenshot suite */
  }
  return names
}

/** Arm the once-per-process exit recorder. Called from launchVerifyBrowser. */
export function armRunRecorder(backend) {
  try {
    if (armed) return
    armed = {
      backend,
      suite: basename(String(process.argv[1] ?? 'unknown'), '.mjs'),
      startedAt: Date.now(),
      asserted: false,
      // The WebGPU feature level the run really came up at, filled in by
      // markBackendAsserted (point 505). null until then — and null it stays for the
      // WebGL 2 lane, where the question does not apply.
      featureLevel: null,
      // The run's own result lines and whether it died rather than reported
      // (point 550) — the raw material of the red accounting below.
      lines: [],
      crashed: false,
      // Result lines the capture cap refused. They become one synthetic
      // UNACCOUNTED red below: a dropped line may have been the one red nobody
      // has filed, and a cap that can silently delete it turns the flood into a
      // way to clear the gate.
      dropped: 0,
    }
    const flush = tapOutput(armed)
    // THE REAL CRASH PATH (four-eyes finding F1). Node prints an uncaught
    // exception — an unhandled rejection at a top-level await included, i.e.
    // exactly a Playwright timeout in a suite that does not catch it — from C++
    // straight to fd 2, AFTER the exit handlers have run. It never passes
    // through the tapped process.stderr.write, so the stderr probe alone left
    // `crashed` false and a half-judged run accounted for. `uncaughtExceptionMonitor`
    // is the observe-only hook for exactly this: it fires before the process
    // dies and changes no behaviour (unlike an 'uncaughtException' or
    // 'unhandledRejection' listener, which would SUPPRESS the crash).
    process.on('uncaughtExceptionMonitor', () => {
      armed.crashed = true
    })
    process.on('exit', (code) => {
      try {
        const shots = screenshotsSince(armed.startedAt)
        const exit = code ?? 0
        // A green run has nothing to account for; only a RED one is charged, and
        // it is charged HERE, at record time, against the ledger as it stood
        // when the run happened. A later ledger edit therefore cannot bless a
        // run after the fact — it takes a fresh run, which is the point.
        let reds = []
        if (exit !== 0) {
          try {
            flush()
            reds = chargeReds(failedChecks(armed.lines.join('\n')), {
              suite: armed.suite,
              backend: armed.backend,
            })
            // UNACCOUNTED reds first, so the cap below can only ever drop a
            // charged one. Truncation must never be able to turn a red run into
            // an accounted-for one; losing a charge only costs detail in the
            // report (a stable sort keeps each group's own order).
            reds.sort((a, b) => (a.point === null ? 0 : 1) - (b.point === null ? 0 : 1))
          } catch {
            /* unparseable output — no red is charged, so the run stays red */
          }
          // A capture that lost lines cannot claim to have read the run's reds:
          // one synthetic UNACCOUNTED red, first in the list so no truncation
          // can drop it either.
          if (armed.dropped > 0) {
            reds.unshift({
              name: `${armed.dropped} further result line(s) exceeded the capture cap — this run's reds were NOT all read`,
              key: 'capture-truncated',
              kind: 'check',
              point: null,
            })
          }
        }
        recordRun({
          backend: armed.backend,
          suite: armed.suite,
          startedAt: armed.startedAt,
          at: Date.now(),
          exit,
          asserted: armed.asserted,
          featureLevel: armed.featureLevel,
          screenshotCount: shots.length,
          screenshots: shots.slice(0, 12),
          ...(exit !== 0 ? { reds: reds.slice(0, MAX_RECORDED_REDS), crashed: armed.crashed } : {}),
        })
      } catch {
        /* never fail a suite over the bookkeeping */
      }
    })
  } catch {
    /* fail-open: recording is evidence, not a gate */
  }
}

/** Called by assertBackend on success — the backend was CONFIRMED, not assumed, and at
 *  the feature level it names ('core' | 'compatibility' | null; point 505). The level is
 *  recorded rather than judged here: `coveringRun(runs, backend, since, {featureLevel})`
 *  is where a reader asks for the player's core path specifically. */
export function markBackendAsserted(featureLevel = null) {
  if (!armed) return
  armed.asserted = true
  armed.featureLevel = featureLevel === 'core' || featureLevel === 'compatibility' ? featureLevel : null
}
