// The autonomous session boundary (point 373, user 27.07.2026) — the IO half.
// The decision logic is pure in scripts/batch-boundary-core.mjs; this module
// only reads the work order, probes the OS launcher, and stores/clears the
// marker. CLI:
//
//   node scripts/batch-boundary.mjs --prepare <point>  validate + name ALL the
//                                             boundary bookkeeping; NO marker
//   node scripts/batch-boundary.mjs --commit <point>   the session's LAST
//                                             repository action: seal the marker
//   node scripts/batch-boundary.mjs <point>   alias for --prepare <point> — the
//                                             sealing one-shot is retired (a stop
//                                             after its write left a marker with
//                                             no bookkeeping; Sol final round)
//   node scripts/batch-boundary.mjs --status  what the Stop hook would decide
//   node scripts/batch-boundary.mjs --clear   withdraw a recorded boundary
//
// Recording is DELIBERATE and verified up front: the command refuses unless the
// point is really closed in the work order and the launcher is really armed, so
// the session learns at the boundary rather than at a blocked turn end.
//
// TWO-PHASE since point 675: the marker used to be written first and the
// bookkeeping done after, and that bookkeeping (the card publish, guard
// remedies) counted as work and deleted the marker — twice on 13.08.2026.
// `--prepare` therefore writes NOTHING (there is nothing to lose while the
// session ends), and `--commit` seals a marker no later call silently deletes:
// post-commit mutations are DENIED loudly (`sealedBoundaryDeny`), with
// `--clear` as the deliberate way back.
import { readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { repoPath } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { readTasksOpen, TASKS_PATH, ARCHIVE_PATH } from './tasks-source.mjs'
import { readOwnerLock } from './batch-singleton.mjs'
import { gatherClaim } from './batch-claim.mjs'
import { reservationDecision } from './batch-claim-core.mjs'
import {
  BOUNDARY_CAUSES,
  BOUNDARY_DESTINATIONS,
  BOUNDARY_DUE_MS,
  BOUNDARY_PHASES,
  LAUNCHER_TASK_NAME,
  assessBoundary,
  boardCarriesCard,
  boundaryCardCommand,
  boundaryCardText,
  boundaryDestination,
  boundaryDueFrom,
  classifyLauncherState,
  markerPhase,
  pointClosure,
  preparedReceipt,
  tickedPointsInDiff,
  unpreparedRefusal,
} from './batch-boundary-core.mjs'
import { launcherRemedy } from './batch-launcher-core.mjs'
import { PUBLISH_CMD } from './board-remedy.mjs'
import { gatherHandoverTransfer as gatherTransfer } from './batch-in-flight.mjs'
import { gatherWatermark, watermarkTokens } from './context-watermark.mjs'
import { launcherState } from './batch-launcher.mjs'
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

/** Where `--prepare` leaves its receipt for `--commit` (Sol's review of 4e93933).
 *  Beside the marker, but NOT a marker: nothing withdraws it and no guard reads
 *  it, so it cannot become a second thing work can delete. */
export const PREPARED_PATH = repoPath('.claude/batch-boundary-prepared.json')

export function readPrepared(path = PREPARED_PATH) {
  try {
    const r = JSON.parse(readFileSync(path, 'utf8'))
    return r && typeof r === 'object' ? r : null
  } catch {
    return null
  }
}

export function writePrepared(receipt, path = PREPARED_PATH) {
  writeJsonAtomic(path, receipt)
}

/**
 * WITHDRAW THE BOUNDARY — marker AND prepare receipt (Sol's review of ffa0a78:
 * a withdrawal that leaves the receipt behind leaves the next `--commit`
 * runnable without a fresh preparation, and a caller that is not the CLI got no
 * receipt removal at all). Returns { marker, prepared }, each true when nothing
 * of that kind is left; a caller that swallows a false re-opens the bypass, so
 * the CLI says so LOUDLY.
 */
export function clearBoundary(path = BOUNDARY_PATH, { preparedPath = PREPARED_PATH } = {}) {
  const gone = (p) => {
    try {
      rmSync(p, { force: true })
      return true
    } catch {
      return false
    }
  }
  return { marker: gone(path), prepared: gone(preparedPath) }
}

/**
 * The launcher's REAL state, probed — never assumed. On any failure the answer is
 * 'unknown', which the guard treats as NOT armed.
 *
 * TWO HOSTS, ONE VOCABULARY (point 474). On Windows the launcher is the Scheduled
 * Task, read off `Get-ScheduledTask`. Everywhere else there is no OS scheduler to
 * ask — the launcher is this repository's own detached daemon
 * (`scripts/batch-launcher.mjs`) and the probe reads that daemon's recorded state,
 * which is published in the SAME ready/running/disabled/unknown words, so a single
 * `classifyLauncherState` maps both. Until this existed `probeLauncherState`
 * answered 'unknown' off win32 and no point boundary could ever be verified on
 * Linux: the one stop the batch is allowed to make was refused outright.
 *
 * `platform` and `exec` are injectable so the Windows path can be proven from a
 * Linux test run, and the Linux path from a Windows one.
 */
export function probeLauncherState({
  taskName = LAUNCHER_TASK_NAME,
  platform = process.platform,
  exec = execFileSync,
  recordPath,
  now,
} = {}) {
  if (platform !== 'win32') {
    try {
      return classifyLauncherState(launcherState({ recordPath, now }).state)
    } catch {
      return 'unknown'
    }
  }
  try {
    const out = exec(
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
  // The CURRENT configured watermark rides along (Sol final round, finding 1):
  // a context claim must clear it as well as its own recorded mark.
  const boundary = assessBoundary({ marker, sid, now, closure, watermarkNow: watermarkTokens() })
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
  // The launcher's own reading, not a second one: it skips its spawn for a claim
  // that is honoured AND for a released one still reserving the freed lock
  // (point 461), so the card must name the claiming window in both states or it
  // announces a fresh session the launcher will not start.
  const where = boundaryDestination({
    claimHonoured: reservationDecision({ assessment: claim }).acquire === false,
    claimantSid: claim.claimantSid,
  })
  // The card takes NO point number (point 439): it goes into the unnumbered gap
  // card, where the topic guard reads every point reference as a foreign one.
  return { ...where, card: boundaryCardText(where) }
}

/**
 * THE COMMIT'S WRITE ORDER, extracted so a test can prove it (Sol re-review of
 * cd6faaa, finding 4): the transfer is recorded FIRST and the marker LAST — a
 * throwing transfer leaves NO marker, because the marker is what authorises the
 * stop and nothing may follow it. `write` is injectable for exactly that proof.
 */
export function commitSealedBoundary({ transfer, marker, write = writeBoundary } = {}) {
  let transferred = null
  if (transfer && typeof transfer.commit === 'function') {
    try {
      transferred = transfer.commit()
    } catch (cause) {
      // STAGE-TAGGED (Sol round 3): a failure here means NOTHING was recorded…
      throw Object.assign(new Error(String(cause?.message ?? cause)), { stage: 'transfer', cause })
    }
  }
  try {
    write(marker)
  } catch (cause) {
    // …while a failure HERE means the transfer already stands and only the
    // marker is missing — reporting it as "nothing recorded" would send the
    // session to re-do a transfer that is done and to distrust a state that is
    // half-taken. The caller says which half, honestly.
    throw Object.assign(new Error(String(cause?.message ?? cause)), { stage: 'marker', cause, transferred })
  }
  return transferred
}

// --- CLI ----------------------------------------------------------------------

const isMain =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (isMain) {
  const argv = process.argv.slice(2)
  const arg = argv[0]
  const sid = readOwnerLock()?.sessionId ?? ''
  const fail = (msg) => {
    console.error(msg)
    process.exit(1)
  }

  if (arg === '--clear') {
    // The prepare receipt goes with the marker: a withdrawn boundary is re-TAKEN
    // from the first phase, bookkeeping included, not committed on the strength
    // of an attempt the session deliberately abandoned.
    const cleared = clearBoundary()
    if (!cleared.marker || !cleared.prepared) {
      // NOT swallowed (Sol's review of ffa0a78): a surviving receipt would let
      // the next `--commit` run on a preparation this session just abandoned.
      fail(
        `the boundary was only PARTLY withdrawn — ${!cleared.marker ? `the marker (${BOUNDARY_PATH})` : `the prepare receipt (${PREPARED_PATH})`} ` +
          'could not be deleted. Remove it by hand and run `--clear` again; until then treat neither the ' +
          'boundary as withdrawn nor a commit as prepared.',
      )
    }
    console.log('boundary marker cleared — the ordinary "do not stop the batch" rule applies again.')
  } else if (arg === '--status' || !arg) {
    const g = gatherBoundary(sid)
    const handover = boundaryHandover({ sid })
    const remedy = launcherRemedy()
    // `gatherBoundary` probes the launcher only when a boundary is claimed or due
    // — right for a hook that runs at every turn end, wrong for the command every
    // message points at to VERIFY the launcher. So the status asks outright, and
    // `launcherProbe` is that answer whether or not a marker exists.
    const launcherProbe = probeLauncherState()
    console.log(
      JSON.stringify(
        // `launcher` is already the STATE gatherBoundary saw; the name and the
        // fresh probe are separate fields so none can shadow another.
        {
          ownerSessionId: sid || null,
          ...g,
          phase: markerPhase(g.marker),
          handover,
          launcherName: remedy.name,
          launcherProbe,
          platform: process.platform,
        },
        null,
        2,
      ),
    )
    if (launcherProbe !== 'armed') {
      console.log(`\nThe launcher "${remedy.name}" is ${launcherProbe} — no boundary stop is possible. To arm it, ${remedy.how}.`)
    }
    if (!g.marker) console.log('\nNo boundary recorded. Usage: node scripts/batch-boundary.mjs <point>')
    else if (g.boundary.valid && g.launcher === 'armed') console.log('\nA boundary stop would be ALLOWED.')
    else console.log(`\nA boundary stop would be REFUSED (${g.boundary.reason}, launcher ${g.launcher}).`)
  } else {
    // --prepare <point>|--context | --commit <point>|--context | <point> (legacy)
    const phaseFlag = arg === '--prepare' || arg === '--commit' ? arg : null
    const contextMode = phaseFlag !== null && argv[1] === '--context'

    if (contextMode) {
      // THE CONTEXT BOUNDARY (point 675, defeat 3): no closed point — the
      // licence is a REAL context reading past the watermark, taken now and
      // recorded in the marker. Everything else mirrors the point boundary.
      if (!sid) {
        fail(
          'no batch lock owner — only the session that owns .claude/batch-lock.json may end at a ' +
            'boundary. Nothing recorded.',
        )
      }
      const tIdx = argv.indexOf('--transcript')
      const wm = gatherWatermark({ transcriptPath: tIdx >= 0 ? argv[tIdx + 1] : '', sid })
      if (wm.state === 'unreadable') {
        fail(
          'NO CONTEXT READING COULD BE TAKEN' +
            (wm.transcript ? ` (${wm.transcript} carries no usage record)` : ' (no transcript was found)') +
            ' — a context boundary fires on a MEASUREMENT, never an assumption. Pass the real transcript: ' +
            `node scripts/batch-boundary.mjs ${phaseFlag} --context --transcript <path> (the Stop hook payload ` +
            'names it as transcript_path). Nothing recorded.',
        )
      }
      if (wm.state !== 'past') {
        fail(
          `the context has NOT passed the watermark (${wm.tokens} < ${wm.watermark} tokens) — the context ` +
            'boundary ends a session the batch can no longer afford, not one that is merely between steps. ' +
            'Keep working. Nothing recorded.',
        )
      }
      const launcher = probeLauncherState()
      if (launcher !== 'armed') {
        const remedy = launcherRemedy()
        fail(
          `the launcher "${remedy.name}" is ${launcher} — nothing would restart the batch, so ending here would ` +
            `strand it. Keep working, and ${remedy.how}. Nothing recorded.`,
        )
      }
      const transfer = gatherTransfer(sid)
      if (transfer.blocked) fail(transfer.message)
      const handover = boundaryHandover({ sid })
      const card = boundaryCardText({
        destination: handover.destination,
        claimantSid: handover.claimantSid,
        cause: BOUNDARY_CAUSES.CONTEXT,
      })
      const cardBlock =
        'THE BOARD CARD — it says WHY this handover happens (the watermark, not a closed point); take it ' +
        'verbatim into the unnumbered gap card:\n\n' +
        `${card}\n\n` +
        `  ${boundaryCardCommand({ point: null, pointCardStanding: false })}   (the German goes in on stdin)\n` +
        `  ${PUBLISH_CMD}\n`
      if (phaseFlag === '--prepare') {
        // The RECEIPT, not a marker: it proves phase one ran, and `--commit`
        // refuses without it (Sol's review of 4e93933).
        writePrepared(preparedReceipt({ sid, cause: BOUNDARY_CAUSES.CONTEXT, now: Date.now() }))
        console.log(
          `PREPARED (nothing recorded yet): the context measures ${wm.tokens} tokens against the ` +
            `${wm.watermark} watermark, the launcher is armed` +
            (transfer.note ? `, and ${transfer.note}` : '') +
            '. Do the boundary bookkeeping NOW, while no marker exists that work could delete:\n\n' +
            `${cardBlock}\n` +
            `Then check nothing else would block (\`node scripts/guard-preflight.mjs --for answer --session ${sid}\`), ` +
            'and make `node scripts/batch-boundary.mjs --commit --context` the LAST repository action of this ' +
            'session. End the session right after.',
        )
        process.exit(0)
      }
      const unprepared = unpreparedRefusal({
        receipt: readPrepared(),
        sid,
        cause: BOUNDARY_CAUSES.CONTEXT,
        now: Date.now(),
      })
      if (unprepared) fail(unprepared)
      // …and the receipt proves only that the phase RAN (Sol's review of
      // ffa0a78). The card is the visible half of defeat 3 — the reader must see
      // that the handover happened because the context passed the mark — so the
      // commit reads the board for it rather than trusting the printout was
      // followed. An unreadable board waves it through: it may not trap a
      // session at its boundary.
      if (!boardCarriesCard(readText(repoPath(BOARD_FILE_DEFAULT)), BOUNDARY_CAUSES.CONTEXT)) {
        fail(
          'THE BOARD DOES NOT CARRY THE WATERMARK CARD — a context handover the board does not explain leaves ' +
            'the reader with a session that vanished for no stated reason. Put up the card `--prepare --context` ' +
            `printed and publish it (\`${PUBLISH_CMD}\`), then commit. Nothing recorded.`,
        )
      }
      // Transfer FIRST, marker LAST (Sol review of 807c2bf, finding 1) —
      // `commitSealedBoundary` pins the order, and a failed transfer refuses
      // before anything is recorded.
      let transferred = null
      try {
        transferred = commitSealedBoundary({
          transfer,
          marker: {
            v: 2,
            phase: BOUNDARY_PHASES.COMMITTED,
            cause: BOUNDARY_CAUSES.CONTEXT,
            sessionId: sid,
            point: null,
            tokens: wm.tokens,
            // The mark the reading was judged against — assessBoundary
            // re-judges the claim (tokens >= watermark), so a marker cannot
            // smuggle a sub-threshold reading past the guard.
            watermark: wm.watermark,
            at: Date.now(),
          },
        })
      } catch (e) {
        fail(
          e?.stage === 'marker'
            ? `the transfer stage succeeded${e.transferred ? ` (${e.transferred})` : ''} but the boundary MARKER ` +
                `could not be written (${e?.message ?? e}) — the boundary is NOT taken. Retry this exact commit: ` +
                'it is idempotent (an already-transferred declaration is not re-judged), and only the marker is missing.'
            : `the in-flight declaration could not be marked transferred (${e?.message ?? e}) — nothing recorded. ` +
                'Retry, or check `node scripts/batch-in-flight.mjs --status`.',
        )
      }
      console.log(
        `boundary COMMITTED at the context watermark (${wm.tokens} >= ${wm.watermark} tokens). This was the ` +
          'last repository action of this session — END IT NOW and SAY in your closing message that the ' +
          'context watermark is why. ' +
          (handover.destination === BOUNDARY_DESTINATIONS.CLAIMING_WINDOW
            ? `The batch goes to claiming window ${handover.claimantSid}. `
            : `The launcher (${launcherRemedy().name}) starts the fresh session. `) +
          'Any further mutation is DENIED loudly (`--clear` withdraws deliberately).' +
          (transferred
            ? ` The in-flight declaration was marked TRANSFERRED (${transferred}); the successor adopts it ` +
              'with `node scripts/batch-in-flight.mjs --adopt`.'
            : ''),
      )
      process.exit(0)
    }

    const pointArg = phaseFlag ? argv[1] : arg
    const point = Number(pointArg)
    if (!Number.isInteger(point) || point <= 0) {
      fail(
        `not a point number: "${pointArg ?? ''}"` +
          (phaseFlag ? ` (usage: node scripts/batch-boundary.mjs ${phaseFlag} <point>)` : ''),
      )
    }
    if (!sid) {
      fail(
        'no batch lock owner — only the session that owns .claude/batch-lock.json may end at a ' +
          'boundary. Nothing recorded.',
      )
    }
    // THE CONDITION (point 675, defeat 2): the point this session was LANDING is
    // LANDED. Delegated authors still building do not hold the boundary — the
    // successor adopts them through the transferred in-flight declaration.
    const closure = closureOf(point)
    if (closure !== 'closed') {
      fail(
        `point ${point} is ${closure === 'open' ? 'still OPEN in TASKS.md' : 'not verifiable in the work order'} ` +
          '— merge and tick it first. Nothing recorded.',
      )
    }
    const launcher = probeLauncherState()
    if (launcher !== 'armed') {
      const remedy = launcherRemedy()
      fail(
        `the launcher "${remedy.name}" is ${launcher} — nothing would restart the batch, so ending here would ` +
          `strand it. Keep working, and ${remedy.how}. Nothing recorded.`,
      )
    }
    // IN-FLIGHT WORK MUST BE TRANSFERABLE (point 675, defeat 2 / merged proposal
    // M28–M34): a worker without a committed-and-pushed checkpoint would die
    // with this session, so it BLOCKS the handover with named recovery choices.
    // A transferable declaration is handed to the successor at commit.
    const transfer = gatherTransfer(sid)
    if (transfer.blocked) fail(transfer.message)
    const handover = boundaryHandover({ sid })
    const toWindow = handover.destination === BOUNDARY_DESTINATIONS.CLAIMING_WINDOW
    const cardBlock =
      'THE BOARD CARD (point 434 (7)) — it must name where the batch actually goes, so take this text ' +
      'verbatim rather than writing it again. It names NO point number on purpose: it goes into the ' +
      'unnumbered gap card, where the topic guard reads every point reference as a foreign one.\n\n' +
      `${handover.card}\n\n` +
      // The command is CHOSEN from the board's real state (point 470), never
      // assumed: an instruction that does not work is what sent sessions to
      // hand-edit the board file, and a hand-edit appends.
      `  ${boundaryCardCommand({ point, pointCardStanding: pointCardStanding(point) })}   (the German ` +
      'goes in on stdin — a Windows shell mangles the umlauts on the argument path)\n' +
      `  ${PUBLISH_CMD}\n`
    const destinationLine = toWindow
      ? `the batch does NOT go to a fresh session: window ${handover.claimantSid} holds an honoured claim, ` +
        'so batch-autostart reserves the batch for it and SKIPS the spawn. '
      : `the launcher (${launcherRemedy().name}) starts a fresh one within its interval and ` +
        'batch-resume-hook re-orients it. '

    if (phaseFlag !== '--commit') {
      // Both `--prepare <point>` AND the bare `<point>` land here. The one-shot
      // that sealed first and did the bookkeeping after is RETIRED (Sol final
      // round, finding 3): a stop right after its write left a committed marker
      // with none of the promised board bookkeeping, which is defeat 1 with a
      // shorter fuse. The bare form keeps WORKING — it starts the two-phase
      // flow and says exactly what to do.
      writePrepared(preparedReceipt({ sid, cause: BOUNDARY_CAUSES.POINT, point, now: Date.now() }))
      console.log(
        (phaseFlag === null
          ? `NOTE: the one-shot form is retired (point 675) — this call ran --prepare ${point} instead, and ` +
            'NOTHING is recorded until the commit.\n\n'
          : '') +
          `PREPARED (nothing recorded yet): point ${point} is landed, the launcher is armed` +
          (transfer.note ? `, and ${transfer.note}` : '') +
          '. Do the boundary bookkeeping NOW, while no marker exists that work could delete:\n\n' +
          `${cardBlock}\n` +
          `Then check nothing else would block (\`node scripts/guard-preflight.mjs --for answer --session ${sid}\`), ` +
          `and make \`node scripts/batch-boundary.mjs --commit ${point}\` the LAST repository action of this ` +
          'session: it seals the marker, and any mutation after it is an explicit error. End the session right after.',
      )
      process.exit(0)
    }

    const unprepared = unpreparedRefusal({
      receipt: readPrepared(),
      sid,
      cause: BOUNDARY_CAUSES.POINT,
      point,
      now: Date.now(),
    })
    if (unprepared) fail(unprepared)

    if (pointCardStanding(point)) {
      fail(
        `the board still carries the current-work card for point ${point}, so the boundary bookkeeping has ` +
          `not been done. Run \`node scripts/batch-boundary.mjs --prepare ${point}\` and follow it — the card, ` +
          'the publish — then commit. Nothing recorded.',
      )
    }

    // Transfer FIRST, marker LAST (Sol review of 807c2bf, finding 1) —
    // `commitSealedBoundary` pins the order.
    let transferred = null
    try {
      transferred = commitSealedBoundary({
        transfer,
        marker: { v: 2, phase: BOUNDARY_PHASES.COMMITTED, cause: BOUNDARY_CAUSES.POINT, sessionId: sid, point, at: Date.now() },
      })
    } catch (e) {
      fail(
        e?.stage === 'marker'
          ? `the transfer stage succeeded${e.transferred ? ` (${e.transferred})` : ''} but the boundary MARKER ` +
              `could not be written (${e?.message ?? e}) — the boundary is NOT taken. Retry this exact commit: ` +
              'it is idempotent (an already-transferred declaration is not re-judged), and only the marker is missing.'
          : `the in-flight declaration could not be marked transferred (${e?.message ?? e}) — nothing recorded. ` +
              'Retry, or check `node scripts/batch-in-flight.mjs --status`.',
      )
    }
    const transferLine = transferred
      ? ` The in-flight declaration was marked TRANSFERRED (${transferred}); the successor adopts it with ` +
        '`node scripts/batch-in-flight.mjs --adopt`, so the running author keeps building through the handover.'
      : ''

    console.log(
      `boundary COMMITTED: point ${point} is landed and the launcher is armed. This was the last repository ` +
        `action of this session — END IT NOW. ${destinationLine}Any further mutation is DENIED loudly ` +
        '(withdraw deliberately with `node scripts/batch-boundary.mjs --clear` if you truly must work again).' +
        transferLine,
    )
  }
}
