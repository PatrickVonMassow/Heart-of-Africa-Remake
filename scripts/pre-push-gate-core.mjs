// Pure decision logic of the pre-push gate (point 302): which checks a push
// must survive before it may reach the remote, and whether a set of results
// blocks it. The wrapper (pre-push-gate.mjs) does the git/npm I/O.
//
// The rule this enforces: CI must never be the first thing to notice a broken
// state. A red run emails the user, and "it went green after I fixed it" does
// not unsend that mail.
//
// This core FAILS CLOSED on a real finding — that is its whole purpose — while
// the wrapper stays fail-open on its own internal errors, like every other
// guard here.

/** The full gate: exactly what CI runs on a push. */
export const FULL_GATE = ['build', 'lint', 'audit', 'unit']

/**
 * A step's runner may report this instead of true/false: the check could not
 * RUN (no network for the dependency audit), which is an environment fact and
 * not a statement about the code. Fail-soft on it — the house rule — but say so.
 */
export const UNAVAILABLE = 'unavailable'

/** The light gate. audit ALWAYS runs — a new CVE is the usual surprise. */
export const LIGHT_GATE = ['lint', 'audit']

/** The branch whose red runs reach the user as mail, and which is deployed. */
export const PROTECTED_REF = 'refs/heads/main'

/** How each step is run, so the wrapper never invents a command of its own. */
export const GATE_COMMANDS = {
  build: ['npm', 'run', 'build'],
  lint: ['npm', 'run', 'lint'],
  audit: ['node', 'scripts/audit-check.mjs'],
  unit: ['npm', 'run', 'test:unit'],
}

/**
 * Paths that cannot change what any gate step measures.
 *
 * This list is deliberately TINY, and the second review is why: the documents
 * that look most like prose are exactly the ones this repository measures.
 * `TASKS.md` and `docs/tasks-archive.md` are read by the archive-guard tests,
 * `CLAUDE.md` and `design.md` by the brief and design-section tests,
 * `docs/graphics-detail-levels.md` by the quality-preset sync test. A fast path
 * that waved those through would have been green locally and red in CI — the
 * exact failure the gate exists to prevent, on its own flagship case.
 *
 * So only what NO test can read qualifies: the git-ignored board and the
 * screenshot corpus.
 */
export function isProseOnlyPath(path) {
  const p = String(path ?? '').replace(/\\/g, '/')
  if (!p) return false
  if (p.startsWith('.batch-dashboard')) return true
  return p.startsWith('verification/')
}

/**
 * The plan for one pushed ref.
 *
 * A feature branch gets the LIGHT gate on purpose: agents commit and push per
 * step, and a full gate on every intermediate commit would cost more working
 * time than the branch's own red run costs. `main` — the deployed branch, and
 * the one whose failures mail the user — always gets what CI runs.
 */
export function gatePlan({ remoteRef, files, deleting = false } = {}) {
  if (deleting) return { steps: [], reason: 'branch deletion — nothing to check' }
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  if (remoteRef !== PROTECTED_REF) {
    return { steps: LIGHT_GATE, reason: `not ${PROTECTED_REF} — lint and audit only` }
  }
  if (list.length && list.every(isProseOnlyPath)) {
    return { steps: LIGHT_GATE, reason: 'prose and board only — no step can measure a difference' }
  }
  return { steps: FULL_GATE, reason: 'push to the deployed branch' }
}

/** The plan for a whole push: the widest plan any of its refs demands. */
export function gatePlanForPush(refs) {
  const plans = (Array.isArray(refs) ? refs : []).map((r) => gatePlan(r))
  const widest = plans.reduce((best, p) => (p.steps.length > (best?.steps.length ?? -1) ? p : best), null)
  return widest ?? { steps: [], reason: 'nothing to push' }
}

/**
 * Parse git's pre-push stdin: `<localRef> <localSha> <remoteRef> <remoteSha>`
 * per line. A local sha of all zeros means the ref is being DELETED.
 */
export function parsePushInput(text) {
  const ZERO = /^0+$/
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [localRef, localSha, remoteRef, remoteSha] = l.split(/\s+/)
      return { localRef, localSha, remoteRef, remoteSha, deleting: ZERO.test(localSha ?? '') }
    })
    .filter((r) => r.remoteRef)
}

/** The one load level on which a red is evidence on its own (point 296). */
export const QUIET = 'quiet'

/**
 * Normalise whatever the injected load reader hands back — a bare level string,
 * a `{ level, reasons }` object, nothing at all — into `{ level, why }`.
 *
 * A reader that throws or answers nonsense yields `unknown`, which is NOT quiet:
 * an unmeasured machine never certifies a red (the same rule machine-load-core
 * applies), and the cost of being wrong here is one extra run, never a waved-
 * through failure.
 */
export function normaliseLoad(value) {
  const raw = typeof value === 'string' ? { level: value } : (value ?? {})
  const level = typeof raw.level === 'string' && raw.level ? raw.level : 'unknown'
  // `why` is accepted as well as `reasons`, so normalising an already normalised
  // reading is a no-op — worseLoad does exactly that, and the reason must not be
  // lost on the way through it.
  const source = raw.reasons ?? raw.why ?? []
  const reasons = Array.isArray(source) ? source : [String(source)]
  return { level, why: reasons.filter(Boolean).join('; ') }
}

/**
 * Whether a red taken at this load level is evidence, or only a reading of the
 * machine (point 296/389).
 *
 * The asymmetry is the entire content: load produces false REDS and never false
 * greens. So a red on a QUIET machine blocks at once — no retry, no lowered bar —
 * and a red on a machine that is busy, loaded or unmeasured buys exactly ONE
 * second run. A step that fails twice blocks whatever the machine says.
 */
export function shouldRetryAfterRed(level) {
  return String(level ?? 'unknown') !== QUIET
}

/** Least to most alarming. Anything unmeasured outranks quiet — never below it. */
const LOAD_SEVERITY = { quiet: 0, unknown: 1, busy: 2, loaded: 3 }

/**
 * The levels the probe may report. The wrapper checks its answer against this
 * list and says so LOUDLY when it does not match (four-eyes finding): a silently
 * unrecognised level degrades to `unknown`, and a permanent `unknown` would turn
 * "a quiet red blocks immediately" into "every red buys a retry" on every machine
 * without anyone noticing the contract had drifted.
 */
export const LOAD_LEVELS = Object.keys(LOAD_SEVERITY)

/**
 * The less quiet of two readings — the answer to "the storm was over by the time
 * we looked".
 *
 * A load probe is a SNAPSHOT. A red produced while a neighbouring build ran can
 * be followed a second later by a quiet reading, and a gate that believed that
 * reading would block a red the load caused. So a reading taken BEFORE the long
 * steps is kept and the two are combined: a machine seen busy at either end was
 * not quiet while the step ran.
 */
export function worseLoad(a, b) {
  const rank = (x) => LOAD_SEVERITY[normaliseLoad(x).level] ?? LOAD_SEVERITY.unknown
  if (!a) return b ? normaliseLoad(b) : null
  if (!b) return normaliseLoad(a)
  return rank(a) >= rank(b) ? normaliseLoad(a) : normaliseLoad(b)
}

/**
 * Whether this plan is worth an opening load reading, taken before the first
 * step (point 389, measured).
 *
 * The probe costs ~2.6 s. `lint` runs in 0.5 s and `audit` in 1.6 s, so on the
 * light gate a pre-reading would more than DOUBLE a feature-branch push — while
 * a load spike that begins and ends inside a half-second lint run is not a thing
 * worth paying for. `build` and `unit` are the minute-long steps a whole storm
 * can hide inside, and there the same 2.6 s is noise. So the opening reading is
 * taken exactly where the blind spot exists.
 */
export const LONG_STEPS = ['build', 'unit']
export function needsOpeningLoadReading(steps) {
  return (Array.isArray(steps) ? steps : []).some((s) => LONG_STEPS.includes(s))
}

/** The line that makes the retry visible — a silent retry hides a real flake. */
export function retryNotice(step, { level, why } = {}) {
  const state = level === 'unknown' ? 'a machine whose quiet could not be verified' : `a machine that is ${level}`
  return (
    `pre-push gate: RETRY — ${step} was red on ${state}${why ? ` (${why})` : ''}.` +
    ' Re-running it ONCE: load produces false reds, never false greens (point 296).' +
    ' A second red blocks the push.'
  )
}

/**
 * The line that closes a retry, so its OUTCOME is as visible as its start.
 *
 * Three outcomes, not two: a re-run that could not RUN neither passed nor was
 * re-measured, and saying "passed" there would assert something untrue in the
 * one place a reader looks for the truth (four-eyes finding).
 */
export function retryOutcomeNotice(step, ok, { unavailable = false } = {}) {
  if (unavailable) return `pre-push gate: the re-run of ${step} could not RUN — it was neither confirmed nor cleared.`
  return ok
    ? `pre-push gate: ${step} passed on the re-run — the first red was the machine, not the code.`
    : `pre-push gate: ${step} failed AGAIN — this red is evidence, and it blocks.`
}

/**
 * Run the planned steps through an injected runner and stop at the first red —
 * the developer fixes that one anyway, and a full sweep would spend minutes
 * proving what is already decided. The runner is injected so this stays pure:
 * the wrapper passes a real spawn, the tests pass a synthetic failure. It is
 * called as `run(step, command, { attempt })`, so the wrapper can time and label
 * a second attempt without the core doing any I/O of its own.
 *
 * `readLoad` is the same seam for the machine. It is called with `{ when, step }`
 * — once as `start` where the plan contains a minute-long step (see
 * needsOpeningLoadReading), and again on every red — and the WORSE of the two
 * readings decides, so a lull after the storm cannot certify a red. On the light
 * gate no opening probe is paid at all, and no probe is ever taken on a green
 * push's short steps. `onNotice` prints — the retry must be visible.
 */
export function runGate(steps, run, { readLoad, onNotice } = {}) {
  const say = typeof onNotice === 'function' ? onNotice : () => {}
  const ask = (when, step) => {
    if (typeof readLoad !== 'function') return null
    try {
      return normaliseLoad(readLoad({ when, step }))
    } catch {
      // A load probe that dies says nothing about the machine; treat it as
      // unmeasured rather than as quiet, and pay one re-run for the doubt.
      return { level: 'unknown', why: 'the load probe failed' }
    }
  }
  const opening = needsOpeningLoadReading(steps) ? ask('start', null) : null
  const results = []
  for (const step of Array.isArray(steps) ? steps : []) {
    const outcome = run(step, GATE_COMMANDS[step], { attempt: 1 })
    // Three outcomes, not two: a step can also be UNAVAILABLE — it could not
    // run at all (an unreachable registry for the audit). That says nothing
    // about the code, so it neither passes nor blocks; it is reported and the
    // run continues. Anything else that is not literally `true` is a failure.
    if (outcome === UNAVAILABLE) {
      results.push({ step, ok: true, unavailable: true })
      continue
    }
    if (outcome === true) {
      results.push({ step, ok: true })
      continue
    }

    // Red. Was the machine quiet enough for that to mean anything? The reading
    // taken now is combined with the one from before the long steps.
    const load = worseLoad(opening, ask('red', step))
    if (!load || !shouldRetryAfterRed(load.level)) {
      results.push({ step, ok: false, ...(load ? { loadLevel: load.level } : {}) })
      break
    }

    say(retryNotice(step, load))
    const second = run(step, GATE_COMMANDS[step], { attempt: 2 })
    if (second === UNAVAILABLE) {
      say(retryOutcomeNotice(step, true, { unavailable: true }))
      results.push({ step, ok: true, unavailable: true, retried: true, loadLevel: load.level })
      continue
    }
    const ok = second === true
    say(retryOutcomeNotice(step, ok))
    results.push({ step, ok, retried: true, loadLevel: load.level })
    if (!ok) break
  }
  return results
}

// ---------------------------------------------------------------------------
// A PASSING COUNT OVER A SET THAT SILENTLY SHRANK (point 404)
//
// On 28.07.2026 one unit run reported 3546 passing tests while 34 test FILES had
// failed to load; the run an hour earlier had 4214 tests over 153 files. A
// damaged dependency tree makes whole suites unloadable, and an unloadable suite
// does not FAIL — it vanishes from the totals, so the report reads GREENER than a
// red run. The same night the tree was destroyed outright (`node_modules` went
// empty when stale worktrees were removed) and the build failed with "tsc is not
// recognized": the same failure class, one step louder.
//
// Nothing in the chain compared the number of EXECUTED files with the last known
// state, so every gate waved it through. It was noticed only because a review
// agent could not start the tests either and said so.
//
// The rule: a run whose evidence base silently shrank is treated as RED. Not
// against a hard-coded number — that would rot with every added suite — but
// against the LAST GREEN RUN's own count.
// ---------------------------------------------------------------------------

/** Where the wrapper keeps the last green run's counts (git-ignored, per checkout). */
export const GATE_STATE_FILE = '.claude/pre-push-gate-state.json'

/** A count is only a count when it is a finite, non-negative number. */
const countOrNull = (n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null)

// --- The discriminator: what is ON DISK ------------------------------------
//
// The first version of this gate blocked ONCE and recorded the lower count as it
// blocked, so a second push with the tree STILL damaged passed — 119 === 119 —
// and the pusher had been told to do exactly that ("run it again"). In this
// repository most pushes come from autonomous agents, whose natural reaction to
// a red gate is `npm ci` and another push; nothing distinguished "understood and
// deliberate" from "retried without fixing" (four-eyes finding 2.1).
//
// The discriminator is on disk. A suite that was genuinely DELETED leaves the
// tree; a suite that could not LOAD is still lying there. So the executed count
// is compared with the number of test files the checkout actually holds, and the
// baseline only follows a drop DOWN when every file present ran. That is also an
// absolute floor, independent of any baseline, which closes finding 2.2: a fresh
// clone or worktree can no longer record a poisoned-low first baseline off an
// already-damaged tree.

/**
 * The globs vitest collects unit test files from — the mirror of `test.include`
 * in `vitest.config.ts`. Mirrored rather than imported because this module is
 * plain ESM read by a git hook and the config is TypeScript; the two are pinned
 * identical by a test, so a changed include list fails the unit layer instead of
 * silently detuning the floor.
 */
export const TEST_FILE_PATTERNS = ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs']

/** The environment flag that ACKNOWLEDGES a drop the tree cannot explain. */
export const DROP_ACK_ENV = 'HOA_ACCEPT_TEST_FILE_DROP'

const escapeLiteral = (c) => (/[.*+?^${}()|[\]\\]/.test(c) ? `\\${c}` : c)

/**
 * A minimal glob→RegExp for exactly the forms `TEST_FILE_PATTERNS` uses:
 * `**` across directories, `*` within one segment, `?`, and `{a,b}` alternation.
 * Deliberately small — a full glob engine would be a dependency, and this floor
 * must keep working in a checkout whose dependency tree is the broken thing.
 */
export function globToRegExp(pattern) {
  const src = String(pattern ?? '').replace(/\\/g, '/')
  let out = '^'
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '*') {
      if (src[i + 1] === '*') {
        // `**/` spans any number of directories, including none at all.
        if (src[i + 2] === '/') { out += '(?:[^/]+/)*'; i += 2 } else { out += '.*'; i += 1 }
      } else out += '[^/]*'
      continue
    }
    if (c === '{') {
      const end = src.indexOf('}', i)
      if (end === -1) { out += '\\{'; continue }
      out += `(?:${src.slice(i + 1, end).split(',').map((alt) => [...alt].map(escapeLiteral).join('')).join('|')})`
      i = end
      continue
    }
    if (c === '?') { out += '[^/]'; continue }
    out += escapeLiteral(c)
  }
  return new RegExp(`${out}$`)
}

/** Whether one repo-relative path is a file vitest would collect. */
export function matchesTestPattern(path, patterns = TEST_FILE_PATTERNS) {
  const p = String(path ?? '').replace(/\\/g, '/').replace(/^\.\//, '')
  if (!p) return false
  return (Array.isArray(patterns) ? patterns : []).some((pattern) => globToRegExp(pattern).test(p))
}

/**
 * The directories worth walking for those patterns — everything before the first
 * wildcard. Walking the whole repository would descend into `node_modules`, and
 * the one moment this count matters is the moment that directory is a mess.
 */
export function testFileRoots(patterns = TEST_FILE_PATTERNS) {
  const roots = new Set()
  for (const pattern of Array.isArray(patterns) ? patterns : []) {
    const p = String(pattern ?? '').replace(/\\/g, '/')
    const cut = p.search(/[*?{[]/)
    const head = cut === -1 ? p : p.slice(0, cut)
    const root = head.slice(0, head.lastIndexOf('/') + 1).replace(/\/$/, '')
    roots.add(root || '.')
  }
  return [...roots]
}

/** How many of the given repo-relative paths vitest would collect (deduplicated). */
export function countTestFilesOnDisk(paths, patterns = TEST_FILE_PATTERNS) {
  const seen = new Set()
  for (const path of Array.isArray(paths) ? paths : []) {
    const p = String(path ?? '').replace(/\\/g, '/').replace(/^\.\//, '')
    if (matchesTestPattern(p, patterns)) seen.add(p)
  }
  return seen.size
}

// Vitest colours its summary even through a pipe, so the escapes come off first.
// Built rather than written as a literal on purpose: an inline control character
// trips oxlint's no-control-regex, and the bracket is a character class so the
// pattern carries no backslash at all. Do not "simplify" it back.
const ANSI = new RegExp(String.fromCharCode(27) + '[[][0-9;]*[A-Za-z]', 'g')

/**
 * One `Test Files` / `Tests` summary line, as a number.
 *
 * The parenthesised total is preferred (`1 failed | 152 passed (153)`) and the
 * named categories are summed where a line carries no total. The LAST occurrence
 * wins: a failure report can print the word earlier in the output.
 */
function summaryLine(text, label) {
  const re = new RegExp(String.raw`^[^\S\n]*${label}[^\S\n]+(.*)$`, 'gm')
  let last = null
  for (const m of text.matchAll(re)) last = m[1]
  return last
}

function summaryCount(text, label) {
  const last = summaryLine(text, label)
  if (last === null) return null
  const total = /\((\d+)\)\s*$/.exec(last)
  if (total) return Number(total[1])
  const parts = [...last.matchAll(/(\d+)\s+(passed|failed|skipped|todo)/g)]
  if (!parts.length) return null
  return parts.reduce((sum, p) => sum + Number(p[1]), 0)
}

/** How many of that line's items FAILED — 0 where the line named no failures. */
function summaryFailed(text, label) {
  const last = summaryLine(text, label)
  if (last === null) return null
  const failed = /(\d+)\s+failed/.exec(last)
  return failed ? Number(failed[1]) : 0
}

function readTotals(output) {
  const text = String(output ?? '').replace(ANSI, '')
  return {
    files: summaryCount(text, 'Test Files'),
    tests: summaryCount(text, 'Tests'),
    failedFiles: summaryFailed(text, 'Test Files'),
    failedTests: summaryFailed(text, 'Tests'),
  }
}

const EMPTY_TOTALS = { files: null, tests: null, failedFiles: null, failedTests: null }

/**
 * The unit run's own totals, read out of its output. NEVER throws and never
 * guesses: an unreadable summary yields `null`, which compares against nothing.
 *
 * Accepts the raw text, or `{ stdout, stderr }` — and where both streams are
 * given, a number read from STDOUT wins. Vitest prints its summary to stdout,
 * and the two streams are concatenated for display; a stray line beginning
 * `Tests 1 passed (1)` arriving on stderr AFTER it would otherwise win the
 * last-occurrence rule and yield a WRONG count, which is worse than none. No
 * current producer emits one — this is a hypothesis, closed cheaply (four-eyes
 * finding) — so stderr still FILLS a number stdout does not carry.
 */
export function parseUnitTotals(output) {
  try {
    if (output && typeof output === 'object' && ('stdout' in output || 'stderr' in output)) {
      const primary = readTotals(output.stdout)
      const combined = readTotals(`${output.stdout ?? ''}${output.stderr ?? ''}`)
      return {
        files: primary.files ?? combined.files,
        tests: primary.tests ?? combined.tests,
        failedFiles: primary.failedFiles ?? combined.failedFiles,
        failedTests: primary.failedTests ?? combined.failedTests,
      }
    }
    return readTotals(output)
  } catch {
    return { ...EMPTY_TOTALS }
  }
}

/**
 * The signature of a runner that DIED rather than a suite that failed: a
 * complete summary naming NO failure, beside a non-zero exit status.
 *
 * Measured 28.07.2026 — three independent runs reported every test passing while
 * the process exited 1 on `[vitest-worker]: Timeout calling "onTaskUpdate"`,
 * under constant load from parallel agents. It does not excuse the red (a
 * runner that cannot finish is still a run that proved nothing), but the verdict
 * must not claim it was the CODE.
 */
export function looksLikeRunnerFailure({ files, tests, failedFiles, failedTests } = {}) {
  return countOrNull(files) !== null && countOrNull(tests) > 0 && failedFiles === 0 && failedTests === 0
}

/** "153 files / 4214 tests" — both numbers, always, so a shrink is visible. */
export function formatUnitTotals({ files, tests } = {}) {
  const f = countOrNull(files)
  const t = countOrNull(tests)
  return `${f === null ? 'an unreadable file count' : `${f} files`} / ${t === null ? 'an unreadable test count' : `${t} tests`}`
}

/** The state file's content, tolerant of an absent, empty or garbled file. */
export function parseGateState(text) {
  try {
    const parsed = JSON.parse(String(text ?? ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** The last green run's test-FILE count, or null where none was ever recorded. */
export function testFileBaseline(state) {
  return countOrNull(state?.unit?.testFiles)
}

/** The state to write back, keeping whatever else the file already carried. */
export function withTestFileBaseline(state, { files, tests, at, onDisk, acknowledgedDropFrom } = {}) {
  const base = state && typeof state === 'object' && !Array.isArray(state) ? state : {}
  const when = at ?? new Date().toISOString()
  return {
    ...base,
    unit: {
      testFiles: countOrNull(files),
      tests: countOrNull(tests),
      // Recorded for the reader, never read back as the floor: the floor is
      // always counted fresh, because the tree is what may have changed.
      onDisk: countOrNull(onDisk),
      at: when,
      // Present ONLY where the escape hatch was used, so an acknowledged drop
      // leaves an auditable trace instead of looking like an ordinary green.
      // Written whenever the hatch fired — including from NO baseline at all,
      // which is exactly the fresh-checkout case, and the one whose trace would
      // otherwise be the easiest to lose.
      ...(acknowledgedDropFrom === undefined
        ? {}
        : { acknowledgedDrop: { from: countOrNull(acknowledgedDropFrom), onDisk: countOrNull(onDisk), at: when } }),
    },
  }
}

/**
 * Compare this run's executed test-FILE count with the last green run's — and,
 * first, with the number of test files the CHECKOUT actually holds.
 *
 * Fail-OPEN where it knows nothing: an unreadable summary compares nothing, and
 * a first run with a healthy tree records rather than blocking.
 *
 * Fail-CLOSED on the two things it does know:
 *   1. Files are lying in the tree that did NOT run. That is the incident's own
 *      signature and it blocks REGARDLESS of the baseline — a re-run cannot
 *      clear it, and no count is recorded while it stands, so an already-damaged
 *      fresh checkout cannot record a poisoned-low first baseline either.
 *   2. Fewer files ran than last time and the tree cannot say why (it could not
 *      be counted). Nothing is recorded; a repeat push does not wave it through.
 *
 * The one drop that IS accepted is the one the tree explains: every file present
 * ran, and there are simply fewer of them — a suite genuinely deleted. Then the
 * baseline follows the deletion down, with no second push needed. The escape
 * hatch for everything else is DELIBERATE and named (`DROP_ACK_ENV`), recorded
 * in the state file rather than performed by pushing twice.
 *
 * Only a GREEN unit run sets the baseline. A red run is already blocked by the
 * gate proper, and its count says nothing about the evidence base's true size.
 */
export function evaluateTestFileCount({ totals, baseline, unitOk = true, onDisk = null, acknowledged = false } = {}) {
  const files = countOrNull(totals?.files)
  const tests = countOrNull(totals?.tests)
  const base = countOrNull(baseline)
  const disk = countOrNull(onDisk)
  const ran = formatUnitTotals({ files, tests })
  const shared = { files, tests, baseline: base, onDisk: disk }
  const wasBase = base === null ? 'no baseline is recorded' : `the baseline still stands at ${base} files`

  if (files === null) {
    return {
      ...shared, status: 'unreadable', blocked: false, nextBaseline: base,
      line:
        `pre-push gate: unit ran ${ran} — the file count could not be read from the run, so nothing was compared` +
        ` (baseline: ${base === null ? 'none recorded' : `${base} files`}).`,
    }
  }
  if (!unitOk) {
    const died = looksLikeRunnerFailure(totals)
    return {
      ...shared, status: 'red-run', blocked: false, nextBaseline: base, runnerLikelyDied: died,
      line: died
        ? `pre-push gate: unit ran ${ran} and its summary named NO failing test, yet the runner exited non-zero — ` +
          'what was observed is a runner that did not finish, not a test that failed (a `[vitest-worker]: Timeout ' +
          'calling "onTaskUpdate"` has this exact signature, and the machine may be loaded). It still blocks: a run ' +
          'that could not finish proved nothing. Its count does not become the baseline.'
        : `pre-push gate: unit ran ${ran} — the run is red, so its count does not become the baseline.`,
    }
  }

  const missing = disk !== null && files < disk ? disk - files : 0
  const unexplained = missing > 0 || (base !== null && files < base && disk === null)

  if (unexplained && acknowledged) {
    return {
      ...shared, status: 'acknowledged', blocked: false, nextBaseline: files,
      line:
        `pre-push gate: unit ran ${ran}, ${missing > 0 ? `${missing} fewer than the ${disk} test files lying in the tree` : `down from ${base} with an uncountable tree`}` +
        ` — waved through because ${DROP_ACK_ENV} was set for this push. ${files} files is recorded as the new baseline.`,
    }
  }
  if (missing > 0) {
    return {
      ...shared, status: 'missing-suites', blocked: true, nextBaseline: base,
      line: [
        `PUSH BLOCKED — ${missing} test file${missing === 1 ? '' : 's'} in this checkout did NOT run: the tree holds ${disk} files` +
          ` matching the unit patterns, this run executed ${files}.`,
        `It reported ${ran}, and a passing count over a smaller set is not a green run.` +
          (base !== null && files < base ? ` The last green run executed ${base} files.` : ''),
        'A suite that cannot LOAD does not fail — it vanishes from the totals, so a damaged dependency tree reads' +
          ' greener than a red one. A suite genuinely DELETED leaves the tree; these are still lying in it.',
        `Repair the tree (npm ci), then run it again:\n  ${GATE_COMMANDS.unit.join(' ')}`,
        `Nothing was recorded and re-running alone will not clear this — ${wasBase}.` +
          ` If the difference is understood and deliberate, push once with ${DROP_ACK_ENV}=1.`,
      ].join('\n'),
    }
  }
  if (unexplained) {
    return {
      ...shared, status: 'shrank-unverified', blocked: true, nextBaseline: base,
      line: [
        `PUSH BLOCKED — the evidence base SHRANK: this run executed ${files} test files, the last green run executed ${base}.`,
        `It reported ${ran}, and a passing count over a smaller set is not a green run.`,
        'The checkout could not be counted, so it is unknown whether those suites were DELETED or merely failed to LOAD' +
          ' — and an unloadable suite does not fail, it vanishes from the totals.',
        `Check the tree (npm ci), then run it again:\n  ${GATE_COMMANDS.unit.join(' ')}`,
        `Nothing was recorded and re-running alone will not clear this — ${wasBase}.` +
          ` If the drop is understood and deliberate, push once with ${DROP_ACK_ENV}=1.`,
      ].join('\n'),
    }
  }

  // Past this point every test file present in the checkout ran.
  if (base === null) {
    return {
      ...shared, status: 'first', blocked: false, nextBaseline: files,
      line: `pre-push gate: unit ran ${ran} — no baseline recorded yet, so ${files} files becomes it. A first run records; it never blocks.`,
    }
  }
  if (files > base) {
    return {
      ...shared, status: 'grew', blocked: false, nextBaseline: files,
      line: `pre-push gate: unit ran ${ran} — up from the last green run's ${base} files; the baseline advances to ${files}.`,
    }
  }
  if (files === base) {
    return {
      ...shared, status: 'same', blocked: false, nextBaseline: base,
      line: `pre-push gate: unit ran ${ran} — the same ${base} files as the last green run.`,
    }
  }
  return {
    ...shared, status: 'shrank-deleted', blocked: false, nextBaseline: files,
    line:
      `pre-push gate: unit ran ${ran} — down from the last green run's ${base} files, and the checkout holds exactly ${disk}` +
      ' matching files, so the missing suites are GONE from the tree rather than failing to load. The baseline follows the' +
      ` deletion down to ${files}.`,
  }
}

/**
 * Whether the results block the push, what failed, what could not run, what was
 * re-run — and, where one was taken, the test-file-count verdict, which blocks
 * on its own (point 404).
 */
export function decide(results, fileCount) {
  const list = Array.isArray(results) ? results : []
  const failed = list.filter((r) => r && r.ok === false).map((r) => r.step)
  const unavailable = list.filter((r) => r && r.unavailable).map((r) => r.step)
  const retried = list.filter((r) => r && r.retried).map((r) => r.step)
  const count = fileCount && typeof fileCount === 'object' ? fileCount : null
  return {
    blocked: failed.length > 0 || count?.blocked === true,
    failed,
    unavailable,
    retried,
    // Omitted entirely when no count was taken, so a caller that never asks for
    // one sees exactly the verdict shape it always saw.
    ...(count ? { fileCount: count } : {}),
  }
}

/** The message the developer sees — it must say what to run, not only what broke. */
export function formatVerdict({ blocked, failed, unavailable = [], retried = [], fileCount = null } = {}, { reason } = {}) {
  // Every list is taken defensively: this runs inside the wrapper's try, and the
  // wrapper fails OPEN on a throw — a formatting error here would turn a BLOCKED
  // push into an allowed one, which is the one direction the gate must never move.
  const red = Array.isArray(failed) ? failed : []
  const gaps = Array.isArray(unavailable) ? unavailable : []
  const redone = Array.isArray(retried) ? retried : []
  const note = gaps.length ? ` — ${gaps.join(', ')} could not run and was NOT checked` : ''
  // A retry stays in the verdict, not only in the scrollback: a green that only
  // came on a second run is a green with a question attached to it.
  const redo = redone.length ? ` — ${redone.join(', ')} was re-run once after a red taken under load` : ''
  // Both numbers lead the verdict whenever a count was taken (point 404), so the
  // size of the evidence base is visible even where it does not yet block.
  const lead = fileCount && typeof fileCount.line === 'string' && fileCount.line ? [fileCount.line] : []
  if (!blocked) return [...lead, `pre-push gate: green (${reason ?? 'gate passed'})${note}${redo}`].join('\n')
  // Blocked by the count ALONE: its own line already carries the whole message,
  // and a second "the fast gate is red: " with nothing after it would be a lie.
  if (!red.length) return lead.join('\n') || 'PUSH BLOCKED — the fast gate refused this push.'
  // The bypass is documented in the hook's own comment and NOT advertised here:
  // most pushes in this repository are made by autonomous agents, and a failure
  // message that names its escape hatch invites the escape.
  const twice = red.filter((f) => redone.includes(f))
  // NOT "the load was not the cause" — that was a false assertion, and it was
  // measured false on 28.07.2026: the load never went away BETWEEN the two runs,
  // so a second red under the same constant load says nothing about its cause.
  // What is true is that the re-run did not clear it, which is why it blocks.
  const twiceLine =
    `${twice.join(', ')} was red on BOTH runs — the re-run did not clear it, so it blocks.` +
    ' The load may well have persisted across both; a second red rules nothing out, it only fails to rule the red out.'
  return [
    ...lead,
    `PUSH BLOCKED — the fast gate is red: ${red.join(', ')}`,
    ...(twice.length ? [twiceLine] : []),
    'CI would fail on this state and mail the failure. Fix it, then push again.',
    `  ${red.map((f) => (GATE_COMMANDS[f] ?? []).join(' ')).join('\n  ')}`,
  ].join('\n')
}
