// Stop hook (rule audit 25.07.2026, mechanism #1): a turn may not end while
// commits exist only locally. See push-arrival-core.mjs for the incident this
// exists for — thirteen commits sat local for a night because git reported a
// push to a DIFFERENT branch as success.
//
// The decision logic is pure and Vitest-covered; this wrapper only gathers git
// facts and is fail-OPEN: any error, an unreadable repo, a detached state we
// cannot count — all allow the stop, because a guard bug must never trap the
// session. It stands down while the batch is paused and while another live
// session owns the batch lock.
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { evaluatePushArrival } from './push-arrival-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { CAUSE } from './guard-preflight-core.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'

const PAUSE = repoPath('.claude', 'batch-paused')

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true }).trim()
  } catch {
    return null
  }
}

/**
 * Everything the core needs — exported so the guard preflight predicts this gate
 * from the SAME gathering the Stop hook uses rather than a second copy of it,
 * which would drift and hand back a false "clean".
 *
 * `ignoreOwnership` is for the --status probe alone: a probe that stays silent
 * under another owner is indistinguishable from "nothing unpushed".
 */
export function gatherPushArrivalInputs({ sessionId = '', ignoreOwnership = false } = {}) {
  if (!ignoreOwnership && heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: CAUSE.notLockOwner }
  }
  const branch = git('symbolic-ref --short -q HEAD') ?? ''
  // Commits reachable from HEAD but from NO remote ref: the real question is
  // "does this work exist anywhere but here", not "is my upstream behind".
  const raw = git('rev-list --count HEAD --not --remotes')
  const ahead = raw === null ? null : Number(raw)
  const hasUpstream = git('rev-parse --abbrev-ref --symbolic-full-name @{u}') !== null
  return {
    applicable: true,
    inputs: { branch, ahead, hasUpstream, paused: existsSync(PAUSE) },
  }
}

if (isMainModule(import.meta.url)) {
  try {
    const status = process.argv[2] === '--status'
    let sid = ''
    if (!status) {
      try {
        sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
      } catch {
        /* manual run — the rule binds regardless */
      }
    }

    const gathered = gatherPushArrivalInputs({ sessionId: sid, ignoreOwnership: status })
    if (!gathered.applicable) process.exit(0)

    const verdict = evaluatePushArrival(gathered.inputs)
    if (status) {
      console.log(JSON.stringify({ ...gathered.inputs, verdict }, null, 2))
      process.exit(0)
    }
    if (verdict) process.stdout.write(JSON.stringify(verdict))
    process.exit(0)
  } catch (e) {
    console.error(`push-arrival-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
