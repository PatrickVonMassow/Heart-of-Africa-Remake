// Stop hook: GUARANTEE the tasks-spec-final-state-only rule the assistant broke
// despite a memory note — when a user change request alters an existing TASKS.md
// point, that point is REWRITTEN COMPLETELY to state only its final correct
// target, never patched with an iterative "first X, then Y" trail (point 258 kept
// the superseded "buttons" plan beside the new dropdown design). The decision
// logic lives in tasks-spec-guard-core.mjs (pure, Vitest-covered); this wrapper
// only reads TASKS.md and is fail-OPEN: any internal error → allow, so a guard
// bug never traps the session.
import { execSync } from 'node:child_process'
import { dirname } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { evaluate } from './tasks-spec-guard-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'

const TASKS = repoPath('TASKS.md')
const PAUSE = repoPath('.claude/batch-paused')
export const BASELINE_PATH = repoPath('.claude/tasks-spec-guard-baseline.json')

const git = (cmd) => execSync(`git ${cmd}`, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' }).trim()

function readBaselineState() {
  try {
    const state = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    return state && typeof state === 'object' ? state : {}
  } catch {
    return {}
  }
}

function writeBaseline(branch, head) {
  const state = readBaselineState()
  const baselines = { ...(state.baselines ?? {}), [branch]: head }
  mkdirSync(dirname(BASELINE_PATH), { recursive: true })
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...state, baselines }, null, 2)}\n`)
}

export function baselineFor(state, branch) {
  const baselines = state?.baselines ?? {}
  return baselines[branch] ?? baselines.main ?? state?.baseline ?? null
}

/** Start a fresh feature checkout at its fork; a fresh main checkout self-arms. */
export function bootstrapBase(head, revParse = (revision) => git(`rev-parse ${revision}`)) {
  for (const ref of ['main', 'origin/main']) {
    try {
      const integration = revParse(`--verify --quiet "${ref}^{commit}"`)
      if (!integration) continue
      const fork = execSync(`git merge-base "${integration}" "${head}"`, {
        windowsHide: true,
        cwd: REPO_ROOT,
        encoding: 'utf8',
      }).trim()
      if (fork) return fork
    } catch {
      /* no integration ref here — try the next, then grandfather this HEAD */
    }
  }
  return head
}

function tasksAt(revision) {
  return execSync(`git show "${revision}:TASKS.md"`, {
    windowsHide: true,
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
}

/**
 * The guard's I/O half, exported so the preflight (point 365 D) can ask "would
 * this block?" from the SAME gathering the Stop hook uses — a second, drifting
 * copy of it would report a false "clean".
 */
export function gatherTasksSpecInputs({ sessionId = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: 'not-lock-owner' }
  }
  if (!existsSync(TASKS)) return { applicable: false, why: 'no TASKS.md in this checkout' }
  const head = git('rev-parse HEAD')
  let branch = 'HEAD'
  try {
    branch = git('rev-parse --abbrev-ref HEAD')
  } catch {
    /* detached or unborn — HEAD is a sufficient local-state key */
  }
  const stored = baselineFor(readBaselineState(), branch)
  const baseline = stored || bootstrapBase(head)
  let base = baseline
  try {
    base = git(`merge-base "${baseline}" "${head}"`)
  } catch {
    // A stale/gc'd local baseline must not disable the guard forever. Re-arm at
    // the honest feature fork (or HEAD where no integration ref exists).
    base = bootstrapBase(head)
  }
  return {
    applicable: true,
    head,
    branch,
    inputs: { tasksMd: readFileSync(TASKS, 'utf8'), baselineTasksMd: tasksAt(base) },
  }
}

if (isMainModule(import.meta.url)) {
  try {
    let sid = ''
    try {
      sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* no/non-JSON stdin (manual run) — the rule is repo truth, not session-local */
    }

    const gathered = gatherTasksSpecInputs({ sessionId: sid })
    if (!gathered.applicable) process.exit(0) // paused / non-owner / no work log

    const result = evaluate(gathered.inputs)
    if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
    else if (gathered.head) writeBaseline(gathered.branch, gathered.head)
    process.exit(0)
  } catch (e) {
    console.error(`tasks-spec-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
