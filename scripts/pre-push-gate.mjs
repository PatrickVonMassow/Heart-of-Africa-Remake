// Pre-push wrapper for the fast gate (point 302). Reads git's pre-push stdin,
// asks the pure core which steps this push must survive, runs them, and refuses
// the push on any red — so CI never becomes the first place a broken state is
// noticed, and the user never gets the failure mail.
//
// FAIL-OPEN on an internal error (a missing git, an unreadable range): a broken
// guard must never make the repository unpushable. A real red, however, fails
// CLOSED — that is the whole point. `git push --no-verify` remains the explicit,
// visible exception.
//
// A RED UNDER LOAD IS NOT EVIDENCE (point 389, the rule of point 296 applied
// here at last). The gate used to measure the machine as much as the code: on
// 28.07.2026 `npm run test:unit` passed standing alone, three times, while the
// same command inside this gate reported red and refused the push, because two
// delegated agents were working and the CPU sat at 45 %. So on a red the gate
// asks `scripts/verify/machine-load.mjs`, and if the machine is not quiet it
// re-runs THAT step ONCE and uses the second result. The bar itself is
// unchanged: a red on a quiet machine blocks immediately, a step that fails
// twice blocks whatever the machine says, and nothing is skipped, warned-about
// instead of blocked, or bypassed. The only question the retry answers is
// whether the first red was evidence.
//
// Every retry PRINTS what is being re-run and why — a silent retry would hide a
// real intermittent defect, which is exactly what the house rule about visible
// retries exists to prevent — and the wrapper times the second attempt, so the
// cost of the retry is measured rather than assumed.
// A PASSING COUNT OVER A SET THAT SILENTLY SHRANK (point 404). The unit step's
// output is CAPTURED as well as printed, so the gate can read how many test
// FILES actually ran and compare that with the last green run's own count. A
// suite that cannot load does not fail — it vanishes from the totals — so a
// damaged dependency tree reports greener than a red run unless someone counts.
//
// And the count is compared with the TREE, not only with the memory: a suite
// genuinely deleted leaves the checkout, an unloadable one is still lying in it.
// That is what tells "understood and deliberate" from "re-ran without fixing" —
// the first version blocked once and recorded the lower number as it blocked, so
// a second push with the tree still damaged sailed through (four-eyes finding).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { tryWriteJsonAtomic } from './atomic-write.mjs'
import {
  DROP_ACK_ENV,
  GATE_STATE_FILE,
  LOAD_LEVELS,
  PROTECTED_REF,
  UNAVAILABLE,
  countTestFilesOnDisk,
  decide,
  evaluateTestFileCount,
  formatVerdict,
  gatePlanForPush,
  parseGateState,
  parseUnitTotals,
  parsePushInput,
  runGate,
  testFileBaseline,
  testFileRoots,
  withTestFileBaseline,
} from './pre-push-gate-core.mjs'

const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' })

/**
 * Files a pushed range touches; EMPTY when the range cannot be resolved — and
 * an empty list widens the plan rather than narrowing it, so an unknown range
 * is never mistaken for "nothing that matters". A brand-new remote ref has no
 * range at all: `git diff <sha>` would compare that commit against the working
 * tree, which is a different question entirely, so it is left unresolved.
 */
function changedFiles({ localSha, remoteSha }) {
  const ZERO = /^0+$/
  if (ZERO.test(remoteSha ?? '')) return []
  try {
    return git(['diff', '--name-only', `${remoteSha}..${localSha}`])
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * The machine's load level, read through the same probe every browser suite uses
 * (`scripts/verify/machine-load.mjs --json`). A subprocess rather than an import
 * on purpose: the probe is async and this wrapper is a straight-line script, and
 * the probe already owns the fail-open behaviour.
 *
 * FAIL-OPEN, but never towards "quiet": an unreadable probe returns `unknown`,
 * which buys one re-run rather than certifying a red.
 */
function readLoadLevel({ when } = {}) {
  const started = Date.now()
  try {
    const res = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/verify/machine-load.mjs'), '--json'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    })
    const parsed = JSON.parse(res.stdout ?? '')
    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    // The JSON shape is a CONTRACT, and a drifted one must be loud (four-eyes
    // finding): silently degrading every reading to `unknown` would quietly turn
    // "a quiet red blocks immediately" into "every red buys a retry", everywhere.
    if (!LOAD_LEVELS.includes(parsed?.level)) {
      console.log(
        `pre-push gate: the load probe answered "${parsed?.level}", which is not one of ${LOAD_LEVELS.join('/')}` +
          ' — its --json contract has drifted; treating the machine as unmeasured.',
      )
      return { level: 'unknown', reasons: ['the load probe reported an unknown level'] }
    }
    console.log(`pre-push gate: machine ${parsed.level} (${when} reading, ${seconds}s)`)
    return { level: parsed.level, reasons: parsed.reasons }
  } catch {
    // Said out loud, not swallowed: "the machine could not be read" is itself a
    // fact about this verdict, and it is what buys the re-run.
    console.log(`pre-push gate: the load probe could not be read (${when} reading) — treating the machine as unmeasured`)
    return { level: 'unknown', reasons: ['the load probe could not be read'] }
  }
}

/**
 * The gate's own memory of the last green unit run (point 404). Git-ignored and
 * per checkout, because each checkout has its own dependency tree and its own
 * branch — a baseline shared across them would compare two different worlds.
 *
 * FAIL-OPEN on every I/O error: a missing, unreadable or garbled state file
 * yields "no baseline", which records and passes rather than blocking.
 */
const gateStatePath = () => resolve(REPO_ROOT, GATE_STATE_FILE)

function readGateState() {
  try {
    return parseGateState(readFileSync(gateStatePath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeGateState(state) {
  // ATOMIC, with the documented Windows retry (scripts/atomic-write.mjs): a torn
  // write garbles the JSON, `parseGateState` then reads it as "no baseline", and
  // the gate silently forgets the number it exists to remember. An antivirus
  // scanner holding the file for a few milliseconds is enough — this repository
  // has already had that EPERM once, on the batch lock.
  const { ok, error } = tryWriteJsonAtomic(gateStatePath(), state)
  // Said out loud rather than swallowed: a baseline that cannot be written is
  // a gate that will never notice the next shrink either.
  if (!ok) console.log(`pre-push gate: the test-count baseline could not be written (${error?.message})`)
}

/**
 * How many test files this CHECKOUT actually holds (point 404, four-eyes fix).
 *
 * The discriminator between the two shrinks: a suite genuinely DELETED leaves
 * the tree, an unloadable one is still lying in it. Counted from the filesystem
 * rather than from `git ls-files`, so a suite deleted in the working tree but
 * not yet committed counts as gone and a brand-new untracked suite counts as
 * present — both are what the runner would actually see.
 *
 * Only the pattern roots are walked, never the whole repository: the one moment
 * this number matters is the moment `node_modules` is the broken thing.
 *
 * FAIL-OPEN into `null`, which means "the tree could not be counted" — and the
 * core treats that as unverifiable, so it blocks a drop rather than waving it
 * through. Fail-open on the reading, fail-closed on the verdict.
 */
function countTestFilesInCheckout() {
  const walk = (dir, prefix, out) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(join(dir, entry.name), rel, out)
      else if (entry.isFile()) out.push(rel)
    }
  }
  try {
    const found = []
    for (const root of testFileRoots()) {
      const dir = resolve(REPO_ROOT, root)
      if (!existsSync(dir)) continue
      walk(dir, root === '.' ? '' : root, found)
    }
    return countTestFilesOnDisk(found)
  } catch (e) {
    console.log(`pre-push gate: the checkout's test files could not be counted (${e.message}) — a drop cannot be verified`)
    return null
  }
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/** The branch this checkout has, as a remote-style ref — the stdin fallback. */
function currentRef() {
  try {
    return `refs/heads/${git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()}`
  } catch {
    return PROTECTED_REF
  }
}

/** What the gate actually measured: the working tree, which may differ. */
function treeWarning(refs) {
  try {
    const dirty = git(['status', '--porcelain']).trim().length > 0
    const head = git(['rev-parse', 'HEAD']).trim()
    const mismatch = refs.some((r) => r.localSha && !r.deleting && r.localSha !== head)
    if (!dirty && !mismatch) return ''
    return (
      'NOTE: the gate measures the WORKING TREE' +
      `${dirty ? ', which has uncommitted changes' : ''}` +
      `${mismatch ? ', and HEAD is not the commit being pushed' : ''}` +
      ' — a green result belongs to what is checked out, not necessarily to what lands.'
    )
  } catch {
    return ''
  }
}

try {
  // Without node_modules nothing can run — that is a worktree fresh off `git
  // worktree add`, where the agent pool pushes after every commit. Blocking
  // there would trade a red pipeline for a stalled pool, so the gate stands
  // down LOUDLY instead of silently.
  if (!existsSync(resolve(REPO_ROOT, 'node_modules'))) {
    console.log('pre-push gate: SKIPPED — no node_modules in this checkout (nothing to run it with)')
    process.exit(0)
  }

  const parsed = parsePushInput(readStdin())
  // An unreadable stdin must not disable the gate; fall back to the branch this
  // checkout is on, with no file list, which takes the widest plan for it.
  const refs = (parsed.length ? parsed : [{ remoteRef: currentRef(), deleting: false }]).map((r) => ({
    ...r,
    files: changedFiles(r),
  }))
  if (!parsed.length) console.log('pre-push gate: no push input readable — judging by the checked-out branch')

  const plan = gatePlanForPush(refs)
  if (plan.steps.length === 0) {
    console.log(`pre-push gate: nothing to check (${plan.reason})`)
    process.exit(0)
  }
  const warning = treeWarning(refs)
  if (warning) console.log(warning)

  console.log(`pre-push gate: ${plan.steps.join(' → ')} (${plan.reason})`)
  // The LAST unit attempt's output — a re-run replaces it, because the second
  // run is the one the verdict is taken from. The streams are kept APART: the
  // summary is read from stdout first, so a stray count on stderr arriving after
  // it can never win the last-occurrence rule (four-eyes finding).
  let unitOutput = { stdout: '', stderr: '' }
  const results = runGate(
    plan.steps,
    (step, [cmd, ...args], { attempt = 1 } = {}) => {
      const started = Date.now()
      // Only the unit step is captured, and it is echoed straight afterwards, so
      // nothing is lost from the scrollback. The cost is that its output arrives
      // in one block instead of streaming — paid for the one step whose totals
      // have to be counted (point 404).
      const capture = step === 'unit'
      const run = spawnSync(cmd, args, {
        cwd: REPO_ROOT,
        stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
        ...(capture ? { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 } : {}),
        shell: process.platform === 'win32',
      })
      if (capture) {
        unitOutput = { stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
        process.stdout.write(`${unitOutput.stdout}${unitOutput.stderr}`)
      }
      // What the retry COSTS, measured rather than estimated (point 389).
      if (attempt > 1) console.log(`pre-push gate: the re-run of ${step} took ${((Date.now() - started) / 1000).toFixed(1)}s`)
      // audit-check exits 3 when the audit could not RUN (offline, registry
      // down). That is an environment fact, not a finding: fail soft, say so.
      if (step === 'audit' && run.status === 3) return UNAVAILABLE
      return run.status === 0
    },
    { readLoad: readLoadLevel, onNotice: (line) => console.log(line) },
  )

  // How large the evidence base actually was — against the CHECKOUT first and
  // the last green run's own count second (point 404). Only taken where the unit
  // step ran at all: the light gate has no unit step, and a build that failed
  // first never reaches one.
  let fileCount = null
  const unitResult = results.find((r) => r?.step === 'unit')
  if (unitResult) {
    const state = readGateState()
    const totals = parseUnitTotals(unitOutput)
    const acknowledged = /^(1|true|yes)$/i.test(String(process.env[DROP_ACK_ENV] ?? ''))
    fileCount = evaluateTestFileCount({
      totals,
      baseline: testFileBaseline(state),
      unitOk: unitResult.ok === true,
      onDisk: countTestFilesInCheckout(),
      acknowledged,
    })
    if (fileCount.nextBaseline !== null && fileCount.nextBaseline !== fileCount.baseline) {
      writeGateState(
        withTestFileBaseline(state, {
          files: fileCount.nextBaseline,
          tests: fileCount.tests,
          onDisk: fileCount.onDisk,
          // An acknowledged drop is RECORDED as such: the escape hatch leaves a
          // trace in the state file rather than only in one console scrollback.
          ...(fileCount.status === 'acknowledged' ? { acknowledgedDropFrom: fileCount.baseline } : {}),
        }),
      )
    }
  }

  const verdict = decide(results, fileCount)
  console.log(formatVerdict(verdict, plan))
  process.exit(verdict.blocked ? 1 : 0)
} catch (e) {
  console.error(`pre-push gate: internal error, allowing the push (${e.message})`)
  process.exit(0)
}
