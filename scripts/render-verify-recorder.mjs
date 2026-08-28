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
// A run that is the RETRY of a failed attempt is recorded SUSPECT (point 640),
// whatever its exit code: runVerdict then refuses it as coverage, because "it
// passed the second time" explains nothing. Like the section flag, it comes from
// the env the runner set — the suite cannot know it is a retry, and must not be
// able to forget it.
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
import { consoleErrorChecks, failedChecks, parseCheckLines } from './verify/baseline-classify-core.mjs'
import { SECTION_ENV, sectionGateWasBuilt } from './verify/sections.mjs'
import { RETRY_ENV, chargeReds, markVariedDetails, parseSuspectReds } from './render-verify-core.mjs'

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

/**
 * NO CAP ON RED LINES, BY MEASUREMENT (point 734). The old 400-line cap existed
 * because a page error that repeats per frame prints one `ERR:` line per
 * OCCURRENCE — but a run that hit it was HALF-RECORDED: a fragment of its red
 * set plus a truncation marker, which no closing of point 640 can reach (all
 * three need the red's identity), so the run was unclosable by construction and
 * blocked the render set until a hand-written --defer.
 *
 * MEASURED 19.08.2026 (re-taken for this fix; scripts/verify/README.md carries
 * the full numbers): the red SET is small — the worst run on record printed 521
 * result lines but only 33 DISTINCT ones, every recorded run holds at most 19
 * parsed reds, and every non-cascade log carries ≤ 12 result lines. What runs
 * away is REPETITION, never the set: reds are bounded by the suite's checks and
 * its distinct console errors.
 *
 * SO THE BUFFER IS BOUNDED BY THE RED'S IDENTITY, NOT BY THE LINE (review
 * finding, 28.08.2026). Keeping each distinct LINE was not a bound at all: a
 * per-frame error whose text carries a counter prints a NEW distinct line every
 * frame, so the buffer grew without limit — and an exhausted process dies,
 * which turns a run full of observed reds into a crash record that a signature
 * can then close. Keeping each distinct KEY is the real bound: the key is what
 * `failedChecks` de-duplicates by anyway, so no verdict changes, and the count
 * is bounded by the suite's own checks.
 *
 * The first line of each key is kept, because it carries the measurement a
 * charge may read. A LATER line of the same key that differs is not kept — and
 * not forgotten either: its key is recorded as VARIED, which makes a narrow
 * `detailMatch` charge refuse the red rather than own it on the one reading it
 * happened to match.
 *
 * AND THE IDENTITY IS NOT A BOUND BY ITSELF (review finding, 28.08.2026, round
 * 13). "Bounded by the suite's checks and its distinct console errors" is true
 * of the checks, whose labels are written in the suite's source and are
 * therefore finite — and NOT true of the console errors, which carry whatever
 * text the page produced. The parser folds counters and URLs away, which
 * answers the per-frame counter the old line cap was built for; it cannot fold
 * away a UUID, a hash, a generated path or a stack address, and each of those
 * mints a fresh identity every time it prints. The measured numbers below are
 * evidence about the logs that exist, never a bound on the ones that do not.
 *
 * SO THE BOUND IS AN EXPLICIT CEILING, AND EXCEEDING IT IS LOUD. Up to
 * MAX_RED_IDENTITIES distinct reds the run is recorded in full; past it the
 * buffer stops growing and the record says INCOMPLETE RECORDING, with the count
 * of the lines it refused. That is this point's own final state taken at its
 * word: a run either records its reds completely, or FAILS LOUDLY as an
 * incomplete recording — never half-records itself. The class therefore stays
 * alive for new records too, which is what gives it a signed way out
 * (render-verify-core.mjs) instead of a hand-written deferral.
 */

/**
 * How many DISTINCT reds one run may record before its recording is declared
 * incomplete. Set against the measurement, not against taste: every recorded run
 * holds at most 19 parsed reds, the worst log on record printed 521 result lines
 * carrying 33 distinct ones, and every non-cascade log carries at most 12. The
 * ceiling is fifteen times that worst distinct set, so no run this project has
 * ever produced comes near it, while a page erroring with fresh text per frame
 * is stopped with a bounded record instead of a dead process — an exhausted
 * process dies, and a crash record is precisely what turns a run full of
 * observed reds into one a signature can close without anybody reading them.
 *
 * The kept set never exceeds it. A line carrying several new identities is
 * weighed whole and refused whole, because a line kept PART-WAY would store
 * reds the record cannot account for — and a refusal is loud, so nothing is
 * lost quietly either way.
 */
export const MAX_RED_IDENTITIES = 500

/**
 * AND THE SAME QUESTION ABOUT TEXT (review finding, 28.08.2026, round 14). A
 * ceiling on IDENTITIES bounds how many reds a run can record and nothing about
 * how long its lines are: a `console errors: [...]` summary repeating ONE error
 * a million times brings a single identity, so it was kept whole — and the
 * retained string, the partial-line buffer it arrived in and the parse over it
 * all grew with the page's output rather than with its red set.
 *
 * So the capture carries two character budgets beside the identity ceiling, and
 * all three are refused the same LOUD way: a line that does not fit is counted
 * and the run is recorded incomplete. The numbers sit far above any measured run
 * — the worst log on record holds 521 result lines, and a result line is a check
 * label with a measurement — while bounding the tap's memory at a few megabytes.
 *
 * MAX_LINE_CHARS is judged BEFORE the line is parsed, so it is the one budget
 * that also applies to a repetition: telling repetition apart means parsing the
 * very line whose size is the problem, and a result line of this length is
 * pathological however often its content has been seen.
 */
export const MAX_CAPTURE_CHARS = 4 * 1024 * 1024
export const MAX_LINE_CHARS = 64 * 1024

/** Stderr that says the process did not end on its own terms — a stack frame or
 *  a bare `…Error:` headline. A run that CRASHED explains nothing about the
 *  picture, however many of its reds are charged, so it never counts as
 *  accounted for. A false positive only makes the gate stricter. */
const CRASH_LINE = /^\s+at .+:\d+:\d+|^(?:Uncaught\s+)?\w*Error(?::|\b)/

/**
 * A kept result line's REDS, each as the identity the accounting downstream
 * uses (`<kind>:<key>`, the form `markVariedDetails` reads) and the observation
 * it printed under it. Null when the parser cannot read the line, which then
 * stands for itself — exactly the old behaviour. Total.
 *
 * ALL of them, never the first (review finding, 28.08.2026). A `console errors:
 * <texts>` summary line carries SEVERAL reds, and keying the whole line by its
 * FIRST parsed error collapsed two such lines that happened to share it: the
 * second line was dropped from the buffer, so the reds only IT carried never
 * reached `failedChecks()` and disappeared without being fixed, charged or
 * filed. The buffer keeps a line for the identities it BRINGS — the parts are
 * asked one by one, and their combination is never a key of its own (round 13).
 */
function resultParts(line) {
  try {
    const parsed = [...parseCheckLines(line), ...consoleErrorChecks(line)]
    if (parsed.length === 0 || parsed.some((p) => !p?.key)) return null
    // The measurement is what the RECORD would keep for this red — its name and
    // its detail — so "it printed differently the second time" is asked of
    // exactly the two fields a charge can read.
    return parsed.map((p) => ({ id: `${p.kind}:${p.key}`, seen: `${p.name}\u0000${p.detail ?? ''}` }))
  } catch {
    return null
  }
}

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
  // Each result IDENTITY is kept ONCE, in first-seen order — the first line
  // that CARRIES it, which holds the measurement a charge may match on. The
  // identity is the parser's own (`failedChecks` de-duplicates by it anyway),
  // so collapsing here changes no verdict.
  //
  // KEYED BY THE IDENTITIES, NOT BY THEIR COMBINATION (review finding,
  // 28.08.2026, round 13). Keying a line by its parts JOINED bounded nothing:
  // `[A,B]`, `[A,C]`, `[B,C]` are three distinct composites over two identities,
  // so a suite whose summary lines vary their grouping minted new keys without
  // ever printing a new red — combinatorially many of them. A line now earns its
  // place only by carrying an identity nothing kept yet; a line whose reds are
  // all already represented is dropped as the pure repetition it is, and the
  // parse downstream still finds those reds inside the lines that WERE kept.
  const keptIds = new Set()
  // The lines the parser could not read at all. They stand for themselves, so
  // they get their own slots — under the same ceiling, since an unparseable
  // result line is exactly the kind that can carry changing text.
  const keptRaw = new Set()
  // The text already kept, against MAX_CAPTURE_CHARS.
  let keptChars = 0
  // Streams whose PENDING remainder outgrew MAX_LINE_CHARS: the middle of that
  // line is gone, so the line is refused when its newline finally arrives
  // rather than parsed as if it were whole.
  const overlong = new Set()
  // A VARIED MEASUREMENT IS A FACT ABOUT ONE RED, NOT ABOUT A LINE (review
  // finding, 28.08.2026). Marking the LINE's composite key missed the case the
  // whole mechanism exists for: `[A(reading 1), B]` followed by `[A(reading 2),
  // C]` are two DIFFERENT composite keys, so both lines are kept and nothing
  // was ever compared — yet `failedChecks` still de-duplicates A by its own key
  // and keeps only reading 1, so reading 2 was lost silently and a narrow
  // charge could then own A on the reading that happened to survive. (The
  // composite key also matched nothing downstream, where `markVariedDetails`
  // asks per red identity.) So the first observation of each PARSED identity is
  // remembered, and a later, different one marks that identity. Bounded the
  // same way the buffer is: one entry per distinct red.
  const firstSeenOfPart = new Map()
  const refuse = () => {
    state.droppedLines = (Number.isFinite(state.droppedLines) ? state.droppedLines : 0) + 1
  }
  const take = (stream, isErr, text) => {
    // A LINE THAT NEVER ENDS IS NOT BUFFERED FOREVER. Whatever a process writes
    // without a newline accumulates here, so the remainder is capped and the
    // damaged line refused when it completes — the same loud disposal a refused
    // line gets, never a silently truncated line parsed as if it were whole.
    const damaged = overlong.has(stream)
    const lines = ((pending.get(stream) ?? '') + text).split('\n')
    let rest = lines.pop() ?? ''
    if (rest.length > MAX_LINE_CHARS) {
      rest = rest.slice(0, MAX_LINE_CHARS)
      overlong.add(stream)
    } else if (lines.length > 0) {
      overlong.delete(stream)
    }
    pending.set(stream, rest)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (isErr && CRASH_LINE.test(line)) state.crashed = true
      // Only the FIRST completed line can be the damaged one — it is the
      // remainder the cap cut, and everything after it arrived whole.
      if (i === 0 && damaged) {
        if (KEPT_LINE.test(line)) refuse()
        continue
      }
      if (!KEPT_LINE.test(line)) continue
      // THE SIZE IS JUDGED BEFORE THE PARSE (review finding, 28.08.2026, round
      // 15). Asking it afterwards let a whole newline-terminated line arrive in
      // ONE write and build its parsed array and identity set first — so the
      // limit refused the line only once the memory it was meant to prevent had
      // already been allocated. It is therefore the one budget asked of EVERY
      // result line, repetition included: deciding whether a line is repetition
      // means parsing exactly the line whose size is the problem.
      //
      // That also makes the refusal independent of how the process chunked its
      // writes. An overlong line assembled across several writes is damaged by
      // the pending cap and refused above; one delivered whole is refused here;
      // both count the same. A result line beyond this size is pathological in
      // any case — the measured worst is a check label with a measurement.
      if (line.length > MAX_LINE_CHARS) {
        refuse()
        continue
      }
      const parts = resultParts(line)
      // What this line would ADD, counted as IDENTITIES and not as parts
      // (review finding, 28.08.2026, round 14). A summary that prints the same
      // red five hundred times carries five hundred parts and exactly one new
      // identity; counting the parts made such a line exceed the ceiling and
      // marked an ordinary repeated-error run incomplete, which is a FALSE
      // truncation — and a false truncation blocks the render set, the very
      // failure this point exists to end.
      const fresh =
        parts === null
          ? (keptRaw.has(line) ? [] : [line])
          : [...new Set(parts.map((p) => p.id).filter((id) => !keptIds.has(id)))]
      // THE CEILING IS DECIDED BEFORE ANYTHING IS REMEMBERED (review finding,
      // 28.08.2026, round 14). The varied-measurement map used to be filled
      // first, so a REFUSED line could fill it to the brim without a single line
      // being kept — and then a later, kept red found no room in it, so its
      // second, different reading was dropped as repetition with nothing marking
      // it, and a narrow charge could own that red on the one reading that
      // survived. Exactly the silent loss the mark exists to prevent.
      // THE CEILING, AND WHY IT IS LOUD (review finding, 28.08.2026, round 13).
      // Beyond it the buffer stops growing and the RUN IS MARKED INCOMPLETE —
      // the loud failure this point's final state names as the alternative to an
      // uncapped buffer, never a silent half-recording: the record says how many
      // lines it refused, `runVerdict` answers `incomplete`, and the signed
      // way out of render-verify-core.mjs disposes of it. Silently discarding
      // them is exactly the trap the point exists to close.
      //
      // ASKED OF WHAT THE LINE WOULD ADD, NOT OF THE BUFFER BEFORE IT (review
      // finding, 28.08.2026, round 14). Testing "is the buffer full yet" and
      // then adding every fresh identity the line carried was no ceiling at all:
      // a `console errors: [...]` summary holds as many reds as the page
      // printed, so ONE such line could take the buffer — and `record.reds`
      // with it — arbitrarily far past the limit without ever marking the run
      // incomplete. A line is now weighed WHOLE: it is kept only if all of its
      // fresh identities fit, and refused as one if they do not. Refusing a
      // line part-way is not on offer, because the record would then hold reds
      // it cannot account for; refusing it whole is loud, which is the contract.
      // BOTH BUDGETS, ASKED THE SAME WAY. The identity ceiling bounds how many
      // reds the record can hold; the character budget bounds how much TEXT the
      // tap holds to carry them, which a line repeating one identity a million
      // times would otherwise leave unbounded.
      // The remaining budgets are asked only of a line that would be KEPT: one
      // bringing nothing new is dropped as repetition, and counting that as a
      // refusal would be a false truncation — which blocks the render set in
      // exactly the way this point exists to end.
      const wouldNotFit =
        fresh.length > 0 &&
        (keptIds.size + keptRaw.size + fresh.length > MAX_RED_IDENTITIES ||
          keptChars + line.length > MAX_CAPTURE_CHARS)
      if (wouldNotFit) {
        refuse()
        continue
      }
      // A line that is kept, or dropped as pure repetition, still has its
      // measurement read: repetition is exactly where a second, DIFFERENT
      // reading of an already-kept red shows up.
      for (const part of parts ?? []) {
        const seen = firstSeenOfPart.get(part.id)
        // The map now only ever learns identities that were KEPT, so it is
        // bounded by the ceiling itself; the size guard stays as a backstop.
        if (seen === undefined) {
          if (firstSeenOfPart.size < MAX_RED_IDENTITIES) firstSeenOfPart.set(part.id, part.seen)
        }
        // The SAME red printed with a DIFFERENT measurement. The record can hold
        // only one, so the difference is remembered as a fact about that red: a
        // narrow charge then refuses it instead of owning it on the single
        // reading that survived.
        else if (seen !== part.seen && state.variedKeys instanceof Set) state.variedKeys.add(part.id)
      }
      // Nothing new means pure repetition: every red the line carries is already
      // in the buffer under a line that was kept, so dropping it loses no
      // observation and is not a truncation.
      if (fresh.length === 0) continue
      if (parts === null) keptRaw.add(line)
      else for (const id of fresh) keptIds.add(id)
      keptChars += line.length
      state.lines.push(line)
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
      // What the FIRST attempt of this suite failed on, when this run is a retry
      // (point 640). Empty means "not a retry" — the runner blanks the variable
      // for a first attempt, so a stale export cannot condemn an ordinary run.
      suspectOf: parseSuspectReds(process.env[RETRY_ENV]),
      startedAt: Date.now(),
      asserted: false,
      // The WebGPU feature level the run really came up at, filled in by
      // markBackendAsserted (point 505). null until then — and null it stays for the
      // WebGL 2 lane, where the question does not apply.
      featureLevel: null,
      // The run's own result lines and whether it died rather than reported
      // (point 550) — the raw material of the red accounting below.
      lines: [],
      // The keys whose measurement did NOT hold still within this run.
      variedKeys: new Set(),
      // Result lines the ceiling refused — each one carried a red nothing else
      // in the buffer stands for, so a run with any is recorded INCOMPLETE.
      droppedLines: 0,
      crashed: false,
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
        // THE TAIL LINE IS READ WHATEVER THE EXIT CODE (review, 19.08.2026).
        // A stream's last line carries no newline when the process dies
        // mid-write; flushed here, before anything is judged, so the red
        // accounting below reads the complete capture — an unterminated last
        // `FAIL` is a red like any other.
        try {
          flush()
        } catch {
          /* never fail a suite over the bookkeeping */
        }
        // A green run has nothing to account for; only a RED one is charged, and
        // it is charged HERE, at record time, against the ledger as it stood
        // when the run happened. A later ledger edit therefore cannot bless a
        // run after the fact — it takes a fresh run, which is the point.
        let reds = []
        if (exit !== 0) {
          try {
            const output = armed.lines.join('\n')
            // The keys the TAP saw print two different measurements — the buffer
            // keeps only the first, so a narrow charge must not own the red on
            // that one reading (review, 28.08.2026).
            reds = chargeReds(markVariedDetails(failedChecks(output), armed.variedKeys), {
              suite: armed.suite,
              backend: armed.backend,
              // The WebGPU feature level this run really came up at, so a charge
              // written for the compatibility lane cannot excuse the core
              // adapter the player runs (point 505 + review, 19.08.2026).
              featureLevel: armed.featureLevel,
            })
          } catch {
            /* unparseable output — no red is charged, so the run stays red */
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
          ...(armed.suspectOf.length ? { suspect: true, suspectOf: armed.suspectOf } : {}),
          // EVERY red the ceiling allowed (point 734): the capture keeps one
          // entry per DISTINCT red identity and the parser de-duplicates by key,
          // so this list is the run's red SET — never its chatter. A cap that
          // silently discarded observed reds is the half-recording the point
          // forbids; the ceiling below says so out loud instead.
          ...(exit !== 0 ? { reds, crashed: armed.crashed } : {}),
          // A RUN THAT HIT THE CEILING IS AN INCOMPLETE RECORDING, and says how
          // much it refused — `runVerdict` then answers `incomplete` and the
          // signed closure disposes of it, which is the whole way out a
          // truncated run has. Only a RED run can carry it: a run that exited 0
          // records no reds at all, so dropped red lines cost it nothing and
          // calling it incomplete would block a genuinely green run.
          ...(exit !== 0 && armed.droppedLines > 0
            ? { truncated: true, droppedLines: armed.droppedLines }
            : {}),
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
