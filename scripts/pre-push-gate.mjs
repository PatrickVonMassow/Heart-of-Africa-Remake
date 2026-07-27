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
import { readFileSync } from 'node:fs'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  decide,
  formatVerdict,
  gatePlanForPush,
  parsePushInput,
  runGate,
} from './pre-push-gate-core.mjs'

const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' })

/** Files a pushed range touches; empty when the range cannot be resolved. */
function changedFiles({ localSha, remoteSha }) {
  const ZERO = /^0+$/
  const range = ZERO.test(remoteSha ?? '') ? [localSha] : [`${remoteSha}..${localSha}`]
  try {
    return git(['diff', '--name-only', ...range]).split('\n').map((s) => s.trim()).filter(Boolean)
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

try {
  const refs = parsePushInput(readStdin()).map((r) => ({ ...r, files: changedFiles(r) }))
  const plan = gatePlanForPush(refs)
  if (plan.steps.length === 0) {
    console.log(`pre-push gate: nothing to check (${plan.reason})`)
    process.exit(0)
  }

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
