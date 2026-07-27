// Pre-push wrapper for the fast gate (point 302). Reads git's pre-push stdin,
// asks the pure core which steps this push must survive, runs them, and refuses
// the push on any red — so CI never becomes the first place a broken state is
// noticed, and the user never gets the failure mail.
//
// FAIL-OPEN on an internal error (a missing git, an unreadable range): a broken
// guard must never make the repository unpushable. A real red, however, fails
// CLOSED — that is the whole point. `git push --no-verify` remains the explicit,
// visible exception.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  PROTECTED_REF,
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
  const results = runGate(plan.steps, (_step, [cmd, ...args]) => {
    const run = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
    return run.status === 0
  })

  const verdict = decide(results)
  console.log(formatVerdict(verdict, plan))
  process.exit(verdict.blocked ? 1 : 0)
} catch (e) {
  console.error(`pre-push gate: internal error, allowing the push (${e.message})`)
  process.exit(0)
}
