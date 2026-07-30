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
import { gatherClaim } from './batch-claim.mjs'
import {
  BOUNDARY_DESTINATIONS,
  BOUNDARY_DUE_MS,
  LAUNCHER_TASK_NAME,
  assessBoundary,
  boundaryCardCommand,
  boundaryCardText,
  boundaryDestination,
  boundaryDueFrom,
  classifyLauncherState,
  pointClosure,
  tickedPointsInDiff,
} from './batch-boundary-core.mjs'
import { BOARD_FILE_DEFAULT } from './dashboard-state.mjs'
import { nowCard } from './board-core.mjs'

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
      { windowsHide: true, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] },
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
    execFileSync('git', args, { windowsHide: true, cwd, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
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

/** At most this many work-order commits inside the window are opened with
 *  `git show`. Ninety minutes never holds forty of them, so the cap only bounds
 *  the pathological case — this runs in a Stop hook on every turn end. */
export const TICK_SCAN_MAX = 40

/**
 * The newest work-order tick WITHIN A TIME WINDOW: { point, at, sha } or null.
 *
 * THE GUARD MUST NOT ASK `lastWorkOrderTick` (point 399). That function scans the
 * newest FIVE work-order commits, and a batch turn routinely appends points: on
 * 28.07.2026 eight append-only commits landed after the tick of point 338, so the
 * tick fell out of the window and `boundaryDueFrom` returned null. The guard then
 * demanded NOTHING throughout the 90 minutes in which it should have been demanding
 * the point boundary — and a session that is not told to hand over keeps the lock
 * and carries the next point in the same context, which is the exact cost point 373
 * exists to avoid.
 *
 * The question is "was a point ticked within `BOUNDARY_DUE_MS`", so it is asked by
 * TIME: one `git log --since` over the two work-order paths, then `git show` only on
 * the candidates inside that window (`tickedPointsInDiff` keeps the rule that an
 * archive move is not a tick). `git` is injectable so the sweep can be proven
 * without a repository; any failure answers null, because this is advisory input to
 * a guard and never a reason to fail one.
 */
export function lastWorkOrderTickSince({
  cwd = repoPath('.'),
  refs = ['main'],
  windowMs = BOUNDARY_DUE_MS,
  now = Date.now(),
  maxCandidates = TICK_SCAN_MAX,
  git = (args) =>
    execFileSync('git', args, { windowsHide: true, cwd, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
} = {}) {
  const paths = ['--', 'TASKS.md', 'docs/tasks-archive.md']
  const since = new Date(now - windowMs).toISOString()
  for (const ref of refs) {
    try {
      const log = git(['log', `--since=${since}`, '--format=%H %ct', ref, ...paths])
      const rows = log
        .split('\n')
        .map((r) => r.trim().match(/^([0-9a-f]{7,40}) (\d+)$/))
        .filter(Boolean)
        .slice(0, maxCandidates)
      for (const m of rows) {
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
        windowsHide: true,
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
    // TIME, not a commit count (point 399): appending points must not be able to
    // push the tick out of the window and silence the demand.
    const candidate = boundaryDueFrom({ tick: lastWorkOrderTickSince({ now }), ownerSince, now })
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

/**
 * WHERE THE BATCH GOES AFTER THIS BOUNDARY, and the German card that says so
 * (point 434 (7)). The decision is pure (`boundaryDestination` /
 * `boundaryCardText`); this only reads the claim state through the SAME
 * `gatherClaim` the guard and the launcher use, so the card cannot announce a
 * successor the launcher will not spawn.
 *
 * An unreadable claim answers "fresh session": that is what happens with no
 * honoured claim, and it is the state the old text always assumed anyway.
 */
/**
 * Does the board still carry a current-work card for `point` (point 470)? That
 * decides WHICH command puts the boundary card up, and the answer must be read
 * rather than assumed: printing `done <n> --none` for a point whose card was
 * already archived is what left sessions with no working command at all, so they
 * hand-edited the board file and stacked three idle cards on it.
 *
 * Any read failure answers false — the pointless `--none` is the one that can
 * fail; `board.mjs none` works in both states, so it is the safe default.
 */
export function pointCardStanding(point, { path = repoPath(BOARD_FILE_DEFAULT) } = {}) {
  try {
    return nowCard(readFileSync(path, 'utf8'), point) != null
  } catch {
    return false
  }
}

export function boundaryHandover({ sid = readOwnerLock()?.sessionId ?? '' } = {}) {
  let claim = { honour: false, claimantSid: null }
  try {
    claim = gatherClaim(sid, { ownerLock: readOwnerLock() })
  } catch {
    /* no readable claim → nobody is waiting for the batch */
  }
  const where = boundaryDestination({ claimHonoured: claim.honour === true, claimantSid: claim.claimantSid })
  // The card takes NO point number (point 439): it goes into the unnumbered gap
  // card, where the topic guard reads every point reference as a foreign one.
  return { ...where, card: boundaryCardText(where) }
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
    const handover = boundaryHandover({ sid })
    console.log(
      JSON.stringify(
        { ownerSessionId: sid || null, ...g, handover, taskName: LAUNCHER_TASK_NAME },
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
    const handover = boundaryHandover({ sid })
    const toWindow = handover.destination === BOUNDARY_DESTINATIONS.CLAIMING_WINDOW
    console.log(
      `boundary recorded: point ${point} is closed and the launcher is armed. End this session now — ` +
        (toWindow
          ? `the batch does NOT go to a fresh session: window ${handover.claimantSid} holds an honoured claim, ` +
            'so batch-autostart reserves the batch for it and SKIPS the spawn. '
          : 'the OS task starts a fresh one within its interval and batch-resume-hook re-orients it. ') +
        'Do NOT start the next point in this context, and do NOT end while a delegated agent is still in ' +
        'flight (its work would be thrown away — let the pool drain first).\n\n' +
        'THE BOARD CARD (point 434 (7)) — it must name where the batch actually goes, so take this text ' +
        'verbatim rather than writing it again. It names NO point number on purpose: it goes into the ' +
        'unnumbered gap card, where the topic guard reads every point reference as a foreign one.\n\n' +
        `${handover.card}\n\n` +
        // The command is CHOSEN from the board's real state (point 470), never
        // assumed: an instruction that does not work is what sent sessions to
        // hand-edit the board file, and a hand-edit appends.
        `  ${boundaryCardCommand({ point, pointCardStanding: pointCardStanding(point) })}   (the German ` +
        'goes in on stdin — a Windows shell mangles the umlauts on the argument path)\n\n' +
        'The card is a CLAIM TO STOP: once it stands, the board gate denies the next state-changing ' +
        'call. Publishing it, the focus stamp and this boundary command are never blocked.',
    )
  }
}
