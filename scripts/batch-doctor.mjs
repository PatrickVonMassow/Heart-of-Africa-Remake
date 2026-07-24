// Batch doctor (user mandate 24.07.2026): after a parallel-session incident the
// OWNER verifies the repo was not corrupted by the concurrent writes, and
// remediates — willing to THROW AWAY suspect work (recoverably: rescue branch +
// named stash) rather than leave a corrupted tree. Every detection and every
// action is appended to .claude/doctor.log for human audit.
//
// Usage:
//   node scripts/batch-doctor.mjs            # diagnose + safe fixes; exit 2 if --repair is needed
//   node scripts/batch-doctor.mjs --repair   # execute the repair plan (rescue branch, stash, abort, reset)
//   node scripts/batch-doctor.mjs --gate     # additionally run the fast gate (test:unit + build + lint)
//
// Exit codes: 0 = consistent (or fully remediated), 1 = gate failed / alert-level
// findings remain, 2 = repairs planned but not executed (run with --repair).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isAbsolute, join } from 'node:path'
import { planRemediation, needsRepair } from './batch-doctor-core.mjs'
import { readOwnerLock, detectParallel, readUnhandledAlert, markAlertHandled } from './batch-singleton.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const LOG = join(REPO, '.claude', 'doctor.log')
const repair = process.argv.includes('--repair')
const gate = process.argv.includes('--gate')

const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`
  console.log(line)
  try {
    writeFileSync(LOG, `${line}\n`, { flag: 'a' })
  } catch {
    /* console already has it */
  }
}

const git = (args, opts = {}) =>
  execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    timeout: opts.timeout ?? 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

// --- Gather the state ----------------------------------------------------------

log(`doctor run starting (repair=${repair}, gate=${gate})`)

let branch = ''
try {
  branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
} catch (e) {
  log(`FATAL: not a usable git checkout (${e && e.message})`)
  process.exit(1)
}

try {
  git(['fetch', 'origin', 'main'], { timeout: 60000 })
} catch {
  log('warn: git fetch failed (offline?) — divergence is judged against the last known origin/main')
}

let mergeInProgress = false
try {
  const p = git(['rev-parse', '--git-path', 'MERGE_HEAD'])
  mergeInProgress = existsSync(isAbsolute(p) ? p : join(REPO, p))
} catch {
  /* unknown — leave false */
}

let dirtyFiles = []
try {
  dirtyFiles = git(['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))
} catch {
  /* unreadable status */
}

let conflictMarkers = false
try {
  // git diff --check reports conflict markers/whitespace in unstaged changes;
  // additionally grep the tracked tree for real marker lines.
  const hits = git(['grep', '-l', '-E', '^(<{7}|>{7}|={7})( |$)', '--', ':!*.md', ':!scripts/batch-doctor.mjs'])
  conflictMarkers = hits.length > 0
  if (conflictMarkers) log(`conflict markers found in: ${hits.replace(/\n/g, ', ')}`)
} catch {
  conflictMarkers = false // git grep exits 1 on no match
}

let divergence = { ahead: 0, behind: 0 }
try {
  const counts = git(['rev-list', '--left-right', '--count', 'origin/main...main']).split(/\s+/)
  divergence = { behind: Number(counts[0]) || 0, ahead: Number(counts[1]) || 0 }
} catch {
  log('warn: could not compute main/origin divergence')
}

let tasksParses = true
try {
  const t = readFileSync(join(REPO, 'TASKS.md'), 'utf8')
  const sawCheckbox = /^- \[/m.test(t)
  const parses = /^- \[[ x]\] \d+\./m.test(t)
  tasksParses = !sawCheckbox || parses
} catch {
  tasksParses = false
}

const owner = readOwnerLock()
const parallelNow = detectParallel(owner?.sessionId ?? '')
const alert = readUnhandledAlert()
const parallelDetected = parallelNow.length > 0 || !!alert

log(
  `state: branch=${branch} mergeInProgress=${mergeInProgress} dirty=${dirtyFiles.length} ` +
    `conflictMarkers=${conflictMarkers} divergence=+${divergence.ahead}/-${divergence.behind} ` +
    `tasksParses=${tasksParses} parallelNow=${parallelNow.length} unhandledAlert=${alert ? 'yes' : 'no'}`,
)

// --- Plan + execute ------------------------------------------------------------

const plan = planRemediation({
  branch,
  mergeInProgress,
  dirtyFiles,
  conflictMarkers,
  divergence,
  tasksParses,
  parallelDetected,
})

if (plan.length === 0) log('repo state CONSISTENT — no remediation needed')
for (const a of plan) log(`planned [${a.level}] ${a.action}: ${a.reason}`)

let alertsRemain = false
for (const a of plan) {
  if (a.level === 'alert') {
    alertsRemain = true
    continue
  }
  if (a.level === 'repair' && !repair) continue
  try {
    if (a.action === 'abort-merge') {
      git(['merge', '--abort'])
      log('EXECUTED abort-merge: half-done merge aborted, pre-merge state restored')
    } else if (a.action === 'quarantine-stash') {
      const name = `doctor-quarantine-${new Date().toISOString().replace(/[:.]/g, '-')}`
      git(['stash', 'push', '-u', '-m', name])
      log(`EXECUTED quarantine-stash: uncommitted concurrent edits moved to stash "${name}" (git stash list to inspect, git stash pop to restore)`)
    } else if (a.action === 'rescue-and-reset') {
      if (branch !== 'main') {
        log(`SKIPPED rescue-and-reset: checkout is on "${branch}", not main — resolve the branch state first`)
        alertsRemain = true
        continue
      }
      const rescue = `rescue/parallel-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
      git(['branch', rescue, 'main'])
      git(['reset', '--hard', 'origin/main'])
      log(`EXECUTED rescue-and-reset: local main preserved on "${rescue}", main hard-reset to origin/main. DISCARDED from main (recoverable on the rescue branch): the diverged local commits.`)
    } else if (a.action === 'fast-forward') {
      git(['merge', '--ff-only', 'origin/main'])
      log('EXECUTED fast-forward: local main fast-forwarded to origin/main')
    }
  } catch (e) {
    log(`FAILED ${a.action}: ${e && e.message} — fix by hand`)
    alertsRemain = true
  }
}

// --- Optional fast gate --------------------------------------------------------

let gateFailed = false
if (gate) {
  for (const cmd of ['npm run test:unit', 'npm run build', 'npm run lint']) {
    try {
      log(`gate: running ${cmd} …`)
      execSync(cmd, { cwd: REPO, stdio: 'pipe', timeout: 15 * 60 * 1000 })
      log(`gate: ${cmd} PASSED`)
    } catch {
      log(`gate: ${cmd} FAILED — the concurrent writes (or the current head) broke it; fix before continuing the batch`)
      gateFailed = true
    }
  }
}

// --- Verdict -------------------------------------------------------------------

const pendingRepair = needsRepair(plan) && !repair
if (!pendingRepair && !gateFailed) {
  markAlertHandled()
  log('parallel alert marked handled')
}
if (pendingRepair) {
  log('VERDICT: repairs planned but NOT executed — rerun with --repair to execute them (all actions are recoverable and logged)')
  process.exit(2)
}
if (gateFailed || alertsRemain) {
  log('VERDICT: findings remain (gate failure or alert-level issues) — fix before continuing the batch')
  process.exit(1)
}
log('VERDICT: consistent — the batch may continue')
process.exit(0)
