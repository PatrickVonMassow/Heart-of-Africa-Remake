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
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  PROTECTED_REF,
  UNAVAILABLE,
  decide,
  formatVerdict,
  gatePlanForPush,
  parsePushInput,
  runGate,
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
    console.log(`pre-push gate: machine ${parsed.level} (${when} reading, ${seconds}s)`)
    return { level: parsed.level, reasons: parsed.reasons }
  } catch {
    return { level: 'unknown', reasons: ['the load probe could not be read'] }
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
  const results = runGate(
    plan.steps,
    (step, [cmd, ...args], { attempt = 1 } = {}) => {
      const started = Date.now()
      const run = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
      // What the retry COSTS, measured rather than estimated (point 389).
      if (attempt > 1) console.log(`pre-push gate: the re-run of ${step} took ${((Date.now() - started) / 1000).toFixed(1)}s`)
      // audit-check exits 3 when the audit could not RUN (offline, registry
      // down). That is an environment fact, not a finding: fail soft, say so.
      if (step === 'audit' && run.status === 3) return UNAVAILABLE
      return run.status === 0
    },
    { readLoad: readLoadLevel, onNotice: (line) => console.log(line) },
  )

  const verdict = decide(results)
  console.log(formatVerdict(verdict, plan))
  process.exit(verdict.blocked ? 1 : 0)
} catch (e) {
  console.error(`pre-push gate: internal error, allowing the push (${e.message})`)
  process.exit(0)
}
