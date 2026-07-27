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
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { repoPath } from './repo-paths.mjs'
import { readTasksOpen, TASKS_PATH, ARCHIVE_PATH } from './tasks-source.mjs'
import { readOwnerLock } from './batch-singleton.mjs'
import {
  LAUNCHER_TASK_NAME,
  assessBoundary,
  classifyLauncherState,
  pointClosure,
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

export function writeBoundary(marker, path = BOUNDARY_PATH) {
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(marker, null, 2))
  renameSync(tmp, path)
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

/** Is point N closed, per the split work order? */
export function closureOf(point) {
  return pointClosure(point, readTasksOpen(TASKS_PATH), readText(ARCHIVE_PATH))
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
  const launcher = boundary.valid ? probeLauncherState() : 'unknown'
  return { marker, closure, boundary, launcher }
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
