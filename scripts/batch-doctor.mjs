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
import {
  planRemediation,
  needsRepair,
  GATE_COMMANDS,
  judgeGateRun,
  gateKey,
  otherSessionsIn,
  shouldRecordSatisfaction,
  INCONCLUSIVE_VERDICT,
} from './batch-doctor-core.mjs'
import { readOwnerLock, detectParallel, readUnhandledAlert, markAlertHandled, DOCTOR_STATE_PATH } from './batch-singleton.mjs'
import { readMachine } from './verify/machine-load.mjs'

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
const readerSid = process.env.CLAUDE_SESSION_ID ?? owner?.sessionId ?? ''
const parallelNow = detectParallel(owner?.sessionId ?? '')
const rawAlert = readUnhandledAlert()
// AN ALERT MUST NAME SOMEONE ELSE (point 431, third half). The alert is a file:
// written by whoever noticed, read back later — and twice on 29.07.2026 the
// session it named was the session reading it. One that names nobody but the
// reader is not evidence of a second writer.
const alertOthers = otherSessionsIn({ alert: rawAlert, readerSid, ownerSid: owner?.sessionId ?? '' })
const alert = rawAlert && alertOthers.length > 0 ? rawAlert : null
if (rawAlert && !alert) {
  log(`parallel alert IGNORED: it names only this session (${readerSid || 'unknown'}) — an alert that cannot name another session is not evidence of one`)
}
const parallelDetected = parallelNow.length > 0 || !!alert
const parallelSids = [...new Set([...parallelNow.map((p) => p.sid), ...alertOthers])]

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
let gateInconclusive = false
if (gate) {
  const results = []
  for (const cmd of GATE_COMMANDS) {
    // The machine is read PER COMMAND, not once for the run: a gate that started
    // beside a delegated agent's build and finished after it drained must not
    // charge the quiet half with the noisy half's verdict.
    const load = await readMachine()
    const worktrees = liveAgentWorktrees()
    let failed = false
    try {
      log(`gate: running ${cmd} …`)
      execSync(cmd, { cwd: REPO, stdio: 'pipe', timeout: 15 * 60 * 1000 })
      log(`gate: ${cmd} PASSED`)
    } catch {
      failed = true
    }
    results.push({ cmd, failed, level: load.level, reasons: load.reasons, agentWorktrees: worktrees })
  }
  // EVIDENCE FIRST in the log: a reader must see which red is evidence before
  // the one that is not.
  const verdict = judgeGateRun(results)
  for (const line of verdict.lines) log(line)
  gateFailed = verdict.broken
  gateInconclusive = verdict.inconclusive
}

/** Agent worktrees other than the main checkout — a build in one of them
 *  competes for the machine as surely as a busy CPU does. */
function liveAgentWorktrees() {
  try {
    return git(['worktree', 'list', '--porcelain'])
      .split(/\r?\n/)
      .filter((l) => l.startsWith('worktree '))
      .map((l) => l.slice(9).trim())
      .slice(1)
      .filter((p) => /[\\/]worktrees[\\/]/.test(p))
  } catch {
    return []
  }
}

// --- Verdict -------------------------------------------------------------------

const pendingRepair = needsRepair(plan) && !repair
if (!pendingRepair && !gateFailed) {
  markAlertHandled()
  log('parallel alert marked handled')
}
// THE DEMAND IS SATISFIED BY A STATE, NOT BY A TURN (point 431, second half).
// The hook fired this gate every turn while the other session merely existed,
// at ~3 minutes of unit tests each time. What is judged is THIS head beside
// THESE sessions; recording the pair holds the demand until one of them moves.
// Only a run that actually ran the gate to a judgeable green may record it —
// `shouldRecordSatisfaction` decides, so an inconclusive red cannot buy a pass.
if (shouldRecordSatisfaction({ gateRan: gate, broken: gateFailed, inconclusive: gateInconclusive, pendingRepair })) {
  recordGateSatisfied()
}
if (pendingRepair) {
  log('VERDICT: repairs planned but NOT executed — rerun with --repair to execute them (all actions are recoverable and logged)')
  process.exit(2)
}
if (gateFailed || alertsRemain) {
  log('VERDICT: findings remain (gate failure or alert-level issues) — fix before continuing the batch')
  process.exit(1)
}
if (gateInconclusive) {
  log(INCONCLUSIVE_VERDICT)
  process.exit(0)
}
log('VERDICT: consistent — the batch may continue')
process.exit(0)

function recordGateSatisfied() {
  try {
    // The SAME file markAlertHandled writes, so the two records stay coherent.
    const statePath = DOCTOR_STATE_PATH
    const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
    const head = (() => {
      try {
        return git(['rev-parse', 'HEAD'])
      } catch {
        return ''
      }
    })()
    if (!head) return
    writeFileSync(statePath, `${JSON.stringify({ ...state, satisfiedGate: gateKey({ head, parallelSids }) }, null, 2)}\n`)
    log(`gate demand satisfied for HEAD ${head.slice(0, 8)} beside [${parallelSids.join(', ') || 'no other session'}]`)
  } catch (e) {
    log(`warn: could not record the gate satisfaction (${e && e.message}) — the demand simply stays live`)
  }
}
