// Stop hook (point 308, user mandate): the »Woran ich gerade arbeite« card must
// mirror REALITY — the checked-out git branch, the worktree agent pool and the
// TASKS.md point state — not only the declared focus. At point 306 the card
// silently kept describing finished work while background work ran; this guard
// makes that drift BLOCK the turn-end instead of relying on memory.
//
// The decision logic lives in dashboard-sync-core.mjs (pure, Vitest-covered);
// this wrapper only GATHERS the inputs (git + file reads — the core does no
// I/O) and is fail-OPEN: any read failure or internal error → allow, so a
// guard bug never traps the session. READ-ONLY: it never edits the card.
//
// Reality signals gathered here:
//   - HEAD branch of the primary checkout (git symbolic-ref)
//   - the worktree agent pool (git worktree list --porcelain; every
//     worktree-isolated Fable agent appears here — .claude/batch-lock.json
//     names only the owning session and carries no per-task ids)
//   - TASKS.md open/done ticks
//   - the .now card titles of the registered dashboard
//
// Manual drive: node scripts/dashboard-sync.mjs --status
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  nowCardTitles,
  parseWorktreeBranches,
  parseTasksPoints,
  evaluate,
} from './dashboard-sync-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
const REPO_ROOT = R('..')
const TASKS = R('../TASKS.md')
const DASHBOARD = R('../.batch-dashboard.html')
const PAUSE = R('../.claude/batch-paused')

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

/** All I/O lives here: read the real state, hand PURE data to the core.
 *  Every field degrades to a fail-open value when unreadable. */
function currentState() {
  const headBranch = git('symbolic-ref --short -q HEAD') ?? '' // '' also when detached
  const worktrees = parseWorktreeBranches(git('worktree list --porcelain') ?? '')
  // The primary checkout's own branch is the HEAD signal, not an agent; drop
  // it (and any duplicate of it) from the pool.
  const agentBranches = worktrees.filter((b) => b !== 'main' && b !== headBranch)
  let tasksText = null
  try {
    tasksText = readFileSync(TASKS, 'utf8')
  } catch {
    // unreadable → tasksReadable false below
  }
  const { open, done } = parseTasksPoints(tasksText)
  return {
    headBranch,
    agentBranches,
    open,
    done,
    tasksReadable: typeof tasksText === 'string',
  }
}

function readCards() {
  try {
    return nowCardTitles(readFileSync(DASHBOARD, 'utf8'))
  } catch {
    return null // dashboard unreadable → core fails open
  }
}

// --status: print the gathered state and the verdict (manual inspection).
if (process.argv[2] === '--status') {
  const state = currentState()
  const cards = readCards()
  const result = evaluate({ cards, state, paused: existsSync(PAUSE) })
  console.log(JSON.stringify({ cards, state, result }, null, 2))
  process.exit(0)
}

// Stop-hook mode.
try {
  let sid = ''
  try {
    sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
  } catch {
    /* no/non-JSON stdin (manual run) — the sync rule is global truth */
  }

  if (existsSync(PAUSE)) process.exit(0) // user-paused: no batch duty in flight
  if (heldByOtherLiveOwner(sid)) process.exit(0) // hard singleton: non-owner sessions stand down
  if (!existsSync(DASHBOARD)) process.exit(0) // no board yet — dashboard-guard owns that case

  const result = evaluate({ cards: readCards(), state: currentState(), paused: false })
  if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
  process.exit(0)
} catch (e) {
  console.error(`dashboard-sync error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
