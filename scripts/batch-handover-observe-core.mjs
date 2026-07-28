// Pure core of the END-TO-END HANDOVER OBSERVATION (point 388).
//
// WHY A SEPARATE OBSERVER: every part of the boundary mechanism worked on the
// night of 28.07.2026 and the batch still stood still for five and a half hours,
// because the parts were never asked to work AS A CHAIN. A green unit layer
// cannot prove this one. So the acceptance is a single observed handover, and
// this module decides — from log lines and git facts alone, never from
// inference — which link of that chain fired and which one broke.
//
// The chain, in order:
//   1. CLOSE     a point is ticked on main
//   2. TAKE      the boundary is taken and the lock marked handed-over
//   3. SPAWN     the launcher's next tick accepts the handover and spawns
//   4. TAKEOVER  the successor converts the lock to itself
//   5. WORK      the successor's first turn produces a commit
//
// Each link reports pass / pending / broken. "Pending" is the honest answer
// while the chain is simply not that far yet; "broken" is only ever returned
// against POSITIVE evidence that the link failed — for link 3 that evidence is
// the launcher logging `skip: owner alive` after the handover was recorded,
// which is exactly the line that repeated 21 times that night.

/** A handover as batch-progress-guard records it in .claude/boundary.log. */
export function parseHandoverLog(text) {
  const out = []
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(/^\[([^\]]+)\] HANDOVER point (\d+) by (\S+)/)
    if (m) out.push({ at: Date.parse(m[1]), point: Number(m[2]), sid: m[3], line: line.trim() })
  }
  return out.filter((h) => Number.isFinite(h.at))
}

/**
 * What the launcher did, from .claude/autostart.log. Three shapes matter: the
 * accepted handover, the spawn it leads to, and the skip that means it never
 * saw one.
 */
export function parseLauncherLog(text) {
  const out = []
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(/^\[([^\]]+)\] (.*)$/)
    if (!m) continue
    const at = Date.parse(m[1])
    if (!Number.isFinite(at)) continue
    const body = m[2]
    let kind = 'other'
    let point = null
    let pid = null
    const acc = body.match(/^HANDOVER accepted: \S+ handed the batch over(?: at point (\d+))?/)
    const spawn = body.match(/^launched pid (\d+)/)
    if (acc) {
      kind = 'handover-accepted'
      point = acc[1] ? Number(acc[1]) : null
    } else if (spawn) {
      kind = 'spawned'
      pid = Number(spawn[1])
    } else if (/^skip: owner alive/.test(body)) kind = 'skip-alive'
    else if (/^WEDGED owner/.test(body)) kind = 'skip-wedged'
    else if (/^SILENT owner/.test(body)) kind = 'silent-notified'
    else if (/^skip: a spawn /.test(body)) kind = 'skip-debounce'
    out.push({ at, kind, point, pid, line: line.trim() })
  }
  return out
}

const link = (id, title, status, evidence, broken) => ({ id, title, status, evidence, broken })

/**
 * Judge the whole chain. Every input is plain data:
 *   tick        { point, at, sha } | null       — the newest tick on main
 *   handovers   parseHandoverLog(...)
 *   launcher    parseLauncherLog(...)
 *   lock        the current .claude/batch-lock.json | null
 *   commits     [{ at, sha, subject }] on main, newest first
 *   now
 * Returns { ok, links: [...] } — ok only when every link passed.
 */
export function assessChain({ tick, handovers = [], launcher = [], lock = null, commits = [], now = Date.now() }) {
  const links = []

  // 1. CLOSE
  if (!tick) {
    links.push(
      link('close', 'a point is closed on main', 'pending', 'no ticked point found on main', 'no tick lands at all'),
    )
    return { ok: false, links }
  }
  links.push(
    link(
      'close',
      'a point is closed on main',
      'pass',
      `point ${tick.point} ticked ${new Date(tick.at).toISOString()}${tick.sha ? ` (${tick.sha.slice(0, 7)})` : ''}`,
      'no tick, or the tick is only an archive move',
    ),
  )

  // 2. TAKE — the guard allowed a boundary stop and marked the lock handed over.
  const handover = handovers.filter((h) => h.point === tick.point && h.at >= tick.at).pop() ?? null
  if (!handover) {
    links.push(
      link(
        'take',
        'the boundary is taken and the lock handed over',
        'pending',
        `no HANDOVER line for point ${tick.point} in .claude/boundary.log`,
        'the session stops without running batch-boundary.mjs — the failure of 28.07.2026; ' +
          'the guard must block that with "TAKE THE POINT BOUNDARY"',
      ),
    )
    return { ok: false, links }
  }
  links.push(link('take', 'the boundary is taken and the lock handed over', 'pass', handover.line, 'no HANDOVER line'))

  // 3. SPAWN — the launcher accepted the handover on one of its next ticks.
  const after = launcher.filter((l) => l.at >= handover.at)
  const accepted = after.find((l) => l.kind === 'handover-accepted') ?? null
  const spawned = accepted ? after.find((l) => l.kind === 'spawned' && l.at >= accepted.at) : null
  const skipped = after.find((l) => l.kind === 'skip-alive' || l.kind === 'skip-wedged') ?? null
  if (accepted && spawned) {
    links.push(link('spawn', 'the launcher accepts the handover and spawns', 'pass', spawned.line, ''))
  } else if (accepted) {
    links.push(
      link(
        'spawn',
        'the launcher accepts the handover and spawns',
        'broken',
        `${accepted.line} — but no "launched pid" line followed`,
        'the acceptance is logged and the spawn is not: claude.exe missing, or the atomic acquire lost the race',
      ),
    )
  } else if (skipped) {
    links.push(
      link(
        'spawn',
        'the launcher accepts the handover and spawns',
        'broken',
        `${skipped.line} — after the handover was recorded`,
        'THE MEASURED FAILURE: the launcher still reads a live owner. The handover did not reach the ' +
          'lock file, or it was withdrawn by a later tool call of the old session',
      ),
    )
  } else {
    const mins = Math.round((now - handover.at) / 60000)
    links.push(
      link(
        'spawn',
        'the launcher accepts the handover and spawns',
        'pending',
        `no launcher tick logged in the ${mins} min since the handover (it runs every 15 min)`,
        'nothing at all appears in .claude/autostart.log → the scheduled task is not armed',
      ),
    )
    return { ok: false, links }
  }

  // 4. TAKEOVER — the lock now belongs to someone else, freshly.
  const takenOver = !!lock && lock.sessionId !== handover.sid && Number(lock.claimedAt) >= handover.at
  links.push(
    link(
      'takeover',
      'the successor owns the batch lock',
      takenOver ? 'pass' : 'broken',
      lock
        ? `lock held by ${lock.sessionId} (kind ${lock.kind ?? 'session'}, pid ${lock.pid ?? '?'}, ` +
          `heartbeat ${new Date(lock.claimedAt).toISOString()})`
        : 'no lock file at all',
      'the lock still names the old session → the spawned session never converted the pending-spawn lock',
    ),
  )

  // 5. WORK — the successor committed something after it was spawned.
  const since = spawned ? spawned.at : handover.at
  const first = commits.filter((c) => c.at >= since).pop() ?? null
  links.push(
    link(
      'work',
      "the successor's first turn produces a commit",
      first ? 'pass' : 'pending',
      first ? `${first.sha.slice(0, 7)} ${first.subject}` : `no commit on main since ${new Date(since).toISOString()}`,
      'the successor comes up and commits nothing → it stood down (lock), or resume-hook never oriented it',
    ),
  )

  return { ok: links.every((l) => l.status === 'pass'), links }
}
