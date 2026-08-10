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
// Every record names the TREE it was taken on (point 595): the `git HEAD` the
// suite armed against and whether the checkout was dirty. That is what makes
// "the full proof ran on the exact merge candidate" checkable rather than
// claimed — evidence only, judged by nothing here.
//
// A `--section` run is recorded PARTIAL (point 566): it exercised one named
// block of the suite, so runVerdict refuses the record as coverage whatever its
// exit code. The flag comes from the env the runner set, never from the suite —
// a suite cannot forget to declare its own partiality.
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
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { recordRun } from './render-verify-state.mjs'
import { failedChecks } from './verify/baseline-classify-core.mjs'
import { SECTION_ENV, sectionGateWasBuilt } from './verify/sections.mjs'
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

/** The checkout the suite is running out of — a git WORKTREE is one of its own,
 *  and its HEAD is the tree that was verified. Derived the same way as the
 *  screenshot directory rather than imported, so this file asks nothing of a
 *  module a test may have replaced. */
const CHECKOUT_DIR = (() => {
  try {
    return fileURLToPath(new URL('..', import.meta.url))
  } catch {
    return process.cwd()
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

/**
 * THE TREE THAT WAS VERIFIED (point 595): the commit the suite ran against, and
 * whether anything was modified on top of it.
 *
 * WHY IT BELONGS IN THE RECORD. The ladder's final rung says the full proof runs
 * ONCE, on the exact merge candidate — `main` merged INTO the branch, the tree
 * that will land — and names "the recorded `git HEAD` of that run" as the
 * evidence that the verified tree IS the merged one. Until now the record named
 * backend, suite, exit code and screenshots, but not the code: two runs of one
 * suite on two different trees were indistinguishable in it, so the claim had
 * nothing behind it.
 *
 * EVIDENCE, DELIBERATELY NOT A GATE. Nothing judges these fields; they let a
 * reader (or a later mechanism) check the claim after the fact. A DIRTY tree is
 * recorded as such rather than being refused, because a dirty checkout is
 * ordinary while repairing — what must not happen is a dirty run passing as a
 * proof of the committed tree, and naming it is what prevents that.
 *
 * Read ONCE, when the suite arms, not at exit: a run that took twenty minutes
 * should name the tree it started on, and a `git` that is missing or slow must
 * never delay a suite's exit handler. Unreadable answers null — never a guess.
 */
function verifiedTree() {
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: CHECKOUT_DIR, encoding: 'utf8', windowsHide: true, timeout: 5000 })
    return r.status === 0 ? String(r.stdout ?? '').trim() : null
  }
  try {
    const head = git('rev-parse', 'HEAD')
    const status = git('status', '--porcelain')
    return { head: head || null, dirty: status === null ? null : status.length > 0 }
  } catch {
    return { head: null, dirty: null }
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
      // The ONE section this run was narrowed to (point 566), read from the env
      // the runner sets rather than from the suite: a suite cannot forget to
      // declare its own partiality, and the flag is what makes runVerdict refuse
      // the record as coverage. Empty/unset means the suite ran whole.
      section: String(process.env[SECTION_ENV] ?? '').trim() || null,
      // The tree this run verified (point 595) — read here, at arming time.
      tree: verifiedTree(),
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
        // A suite that consulted NO section gate ran WHOLE, whatever the
        // environment said — a stale exported VERIFY_SECTION, or a suite not
        // sectioned yet. The record still says partial, which errs toward
        // refusing coverage rather than granting it, but the mismatch is said
        // out loud so nobody hunts a suite that "only ran one section".
        if (armed.section && !sectionGateWasBuilt()) {
          console.log(
            `NOTE  ${armed.suite} consulted no section gate, so it ran WHOLE — but ${SECTION_ENV}=${armed.section} is set, so this run is recorded PARTIAL and proves no coverage. Unset it.`,
          )
        }
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
          // Named even when unreadable (null), so a record can never be mistaken
          // for one taken on a tree nobody wrote down.
          head: armed.tree.head,
          dirty: armed.tree.dirty,
          startedAt: armed.startedAt,
          at: Date.now(),
          exit,
          asserted: armed.asserted,
          featureLevel: armed.featureLevel,
          screenshotCount: shots.length,
          screenshots: shots.slice(0, 12),
          ...(armed.section ? { partial: true, section: armed.section } : {}),
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
