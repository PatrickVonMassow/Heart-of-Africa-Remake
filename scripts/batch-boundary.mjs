// The autonomous session boundary (point 373, user 27.07.2026) — the IO half.
// The decision logic is pure in scripts/batch-boundary-core.mjs; this module
// only reads the work order, probes the OS launcher, and stores/clears the
// marker. CLI:
//
//   node scripts/batch-boundary.mjs <point>   record: point N is closed, end here
//   node scripts/batch-boundary.mjs --status  what the Stop hook would decide
//   node scripts/batch-boundary.mjs --clear   withdraw a recorded boundary
//
// Recording is DELIBERATE and verified up front: the command refuses unless the
// point is really closed in the work order and the launcher is really armed, so
// the session learns at the boundary rather than at a blocked turn end.
import { readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { repoPath } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { readTasksOpen, TASKS_PATH, ARCHIVE_PATH } from './tasks-source.mjs'
import { readOwnerLock } from './batch-singleton.mjs'
import {
  LAUNCHER_TASK_NAME,
  assessBoundary,
  boundaryDueFrom,
  classifyLauncherState,
  pointClosure,
  tickedPointsInDiff,
} from './batch-boundary-core.mjs'

export const BOUNDARY_PATH = repoPath('.claude/batch-boundary.json')

const readText = (p) => {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

/** The recorded marker, or null. */
export function readBoundary(path = BOUNDARY_PATH) {
  try {
    const m = JSON.parse(readFileSync(path, 'utf8'))
    return m && typeof m === 'object' ? m : null
  } catch {
    return null
  }
}

/** Retries a Windows EPERM/EBUSY like every other state write here — the marker
 *  is what authorises the stop, and a lost one costs the batch a whole session. */
export function writeBoundary(marker, path = BOUNDARY_PATH) {
  writeJsonAtomic(path, marker)
}

export function clearBoundary(path = BOUNDARY_PATH) {
  try {
    rmSync(path, { force: true })
    return true
  } catch {
    return false
  }
}

/**
 * The launcher's REAL state, probed — never assumed. Windows only (the task is a
 * Windows Scheduled Task); anywhere else, and on any failure, the answer is
 * 'unknown', which the guard treats as NOT armed.
 */
export function probeLauncherState({ taskName = LAUNCHER_TASK_NAME } = {}) {
  if (process.platform !== 'win32') return 'unknown'
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `(Get-ScheduledTask -TaskName '${taskName}' -ErrorAction Stop).State`,
      ],
      { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return classifyLauncherState(out)
  } catch {
    return 'unknown'
  }
}

/**
 * The newest work-order TICK in git: { point, at } or null. Ticks are main-only
 * (CLAUDE.md §6), so `main` is what is asked — never the checked-out HEAD, which
 * during a point is a feature branch (four-eyes review, finding 4). A checkout
 * without that ref simply reports nothing, which only costs the reminder.
 *
 * execFile, never a shell: the revision never reaches cmd.exe, where a bare `^`
 * in a revision is eaten. Any git failure answers null — this is advisory input
 * to a guard, never a reason to fail one.
 */
export function lastWorkOrderTick({ cwd = repoPath('.'), refs = ['main'] } = {}) {
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const paths = ['--', 'TASKS.md', 'docs/tasks-archive.md']
  for (const ref of refs) {
    try {
      // The newest few work-order commits, not just the last: appending a new
      // point after ticking one would otherwise mask the tick.
      const log = git(['log', '-5', '--format=%H %ct', ref, ...paths])
      for (const row of log.split('\n')) {
        const m = row.trim().match(/^([0-9a-f]{7,40}) (\d+)$/)
        if (!m) continue
        const points = tickedPointsInDiff(git(['show', '--format=', '--unified=0', m[1], ...paths]))
        if (points.length > 0) {
          return { point: points[points.length - 1], at: Number(m[2]) * 1000, sha: m[1] }
        }
      }
      return null
    } catch {
      /* no such ref / not a repo — try the next */
    }
  }
  return null
}

/**
 * Is point N closed, per the split work order? The WORKING TREE is asked first,
 * and `main` second — a feature-branch checkout carries the work order as it was
 * when the branch was cut, so a point ticked on main after that reads "still
 * OPEN" there. Without the fallback the guard (which reads main) would demand a
 * boundary the CLI (which read the checkout) refuses: a contradiction that loops
 * (four-eyes review, finding 6). Ticks are main-only, so main is the authority.
 */
export function closureOf(point, { cwd = repoPath('.') } = {}) {
  const local = pointClosure(point, readTasksOpen(TASKS_PATH), readText(ARCHIVE_PATH))
  if (local === 'closed') return local
  try {
    const show = (path) =>
      execFileSync('git', ['show', `main:${path}`], {
        cwd,
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    const onMain = pointClosure(point, show('TASKS.md'), show('docs/tasks-archive.md'))
    return onMain === 'closed' ? 'closed' : local
  } catch {
    return local // no main ref / not a repo — the checkout is all there is
  }
}

/**
 * Everything the Stop hook needs, gathered: the marker's verdict and the
 * launcher state. Kept here (not in the guard) so the CLI and the guard judge
 * the same inputs.
 */
export function gatherBoundary(sid, { now = Date.now(), path = BOUNDARY_PATH } = {}) {
  const marker = readBoundary(path)
  const closure = marker ? closureOf(marker.point) : 'unknown'
  const boundary = assessBoundary({ marker, sid, now, closure })
  // Probe the OS only when a boundary is actually claimed — this runs at every
  // turn end of the owning session, and a PowerShell round-trip per turn for a
  // question nobody asked would be pure waste.
  let launcher = boundary.valid ? probeLauncherState() : 'unknown'
  // Is one DUE (point 388)? Asked at every turn end that has no valid marker —
  // that is the whole failure case — at the cost of two short git calls, and
  // only ever for the owning session (the guard gathers nothing for the others).
  let due = null
  if (!boundary.valid) {
    const lock = readOwnerLock()
    const ownerSince =
      lock && lock.sessionId === sid
        ? (typeof lock.acquiredAt === 'number' ? lock.acquiredAt : lock.startedAt)
        : undefined
    const candidate = boundaryDueFrom({ tick: lastWorkOrderTick(), ownerSince, now })
    if (candidate) {
      // Never DEMAND a boundary the CLI would refuse. With an unarmed launcher
      // `batch-boundary.mjs` says "keep working" while the guard would keep
      // saying "take the boundary" — a contradiction that loops for as long as
      // the tick stays fresh (four-eyes review, finding 4). The probe costs a
      // PowerShell round trip, and only in the rare window after a tick.
      launcher = probeLauncherState()
      if (launcher === 'armed') due = candidate
    }
  }
  return { marker, closure, boundary, launcher, due }
}

// --- CLI ----------------------------------------------------------------------

const isMain =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (isMain) {
  const arg = process.argv[2]
  const sid = readOwnerLock()?.sessionId ?? ''
  const fail = (msg) => {
    console.error(msg)
    process.exit(1)
  }

  if (arg === '--clear') {
    clearBoundary()
    console.log('boundary marker cleared — the ordinary "do not stop the batch" rule applies again.')
  } else if (arg === '--status' || !arg) {
    const g = gatherBoundary(sid)
    console.log(
      JSON.stringify(
        { ownerSessionId: sid || null, ...g, taskName: LAUNCHER_TASK_NAME },
        null,
        2,
      ),
    )
    if (!g.marker) console.log('\nNo boundary recorded. Usage: node scripts/batch-boundary.mjs <point>')
    else if (g.boundary.valid && g.launcher === 'armed') console.log('\nA boundary stop would be ALLOWED.')
    else console.log(`\nA boundary stop would be REFUSED (${g.boundary.reason}, launcher ${g.launcher}).`)
  } else {
    const point = Number(arg)
    if (!Number.isInteger(point) || point <= 0) fail(`not a point number: "${arg}"`)
    if (!sid) {
      fail(
        'no batch lock owner — only the session that owns .claude/batch-lock.json may end at a ' +
          'boundary. Nothing recorded.',
      )
    }
    const closure = closureOf(point)
    if (closure !== 'closed') {
      fail(
        `point ${point} is ${closure === 'open' ? 'still OPEN in TASKS.md' : 'not verifiable in the work order'} ` +
          '— merge and tick it first. Nothing recorded.',
      )
    }
    const launcher = probeLauncherState()
    if (launcher !== 'armed') {
      fail(
        `the launcher task "${LAUNCHER_TASK_NAME}" is ${launcher} — nothing would restart the batch, so ` +
          'ending here would strand it. Keep working, and ask the user to run ' +
          `\`Enable-ScheduledTask -TaskName '${LAUNCHER_TASK_NAME}'\` in an elevated PowerShell. Nothing recorded.`,
      )
    }
    writeBoundary({ v: 1, sessionId: sid, point, at: Date.now() })
    console.log(
      `boundary recorded: point ${point} is closed and the launcher is armed. End this session now — ` +
        'the OS task starts a fresh one within its interval and batch-resume-hook re-orients it. Do NOT ' +
        'start the next point in this context, and do NOT end while a delegated agent is still in ' +
        'flight (its work would be thrown away — let the pool drain first).',
    )
  }
}
