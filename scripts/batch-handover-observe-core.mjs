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

/** Mirrors HANDOVER_GRACE_MS in scripts/batch-singleton.mjs — how long the
 *  launcher legitimately waits out a live process after a handover. The observer
 *  must not call that wait a failure; the test pins the two to agree. */
export const OBSERVE_GRACE_MS = 15 * 60 * 1000

/** How long after a spawn the successor may still be booting before its failure
 *  to own the lock counts as a broken link rather than a slow one. */
export const TAKEOVER_GRACE_MS = 10 * 60 * 1000

/**
 * What the launcher did, from .claude/autostart.log. Four shapes matter: an
 * accepted handover, the spawn it leads to, the takeover of an already-free lock
 * (the headless path — a `claude -p` exits and SessionEnd releases the lock, so
 * there is no handover left for the launcher to accept), and the skip that means
 * it still saw a live owner.
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
    let reason = null
    const acc = body.match(/^HANDOVER accepted: \S+ handed the batch over(?: at point (\d+))?/)
    const spawn = body.match(/^launched pid (\d+)/)
    const skip = body.match(/^skip: owner alive \(([^;)]+)/)
    if (acc) {
      kind = 'handover-accepted'
      point = acc[1] ? Number(acc[1]) : null
    } else if (spawn) {
      kind = 'spawned'
      pid = Number(spawn[1])
    } else if (skip) {
      // `handover-grace` is the launcher waiting out a live process on purpose —
      // a healthy chain on schedule, never evidence of a failure.
      kind = skip[1].trim() === 'handover-grace' ? 'skip-grace' : 'skip-alive'
      reason = skip[1].trim()
    } else if (/^WEDGED owner/.test(body)) kind = 'skip-wedged'
    else if (/^SILENT owner/.test(body)) kind = 'silent-notified'
    else if (/^no owner lock — taking over/.test(body)) kind = 'took-free-lock'
    else if (/^owner provably dead/.test(body)) kind = 'took-dead-lock'
    else if (/^skip: a spawn /.test(body)) kind = 'skip-debounce'
    out.push({ at, kind, point, pid, reason, line: line.trim() })
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
export function assessChain({
  tick,
  handovers = [],
  launcher = [],
  lock = null,
  commits = [],
  now = Date.now(),
  graceMs = OBSERVE_GRACE_MS,
  takeoverGraceMs = TAKEOVER_GRACE_MS,
}) {
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

  // 3. SPAWN — the launcher took the batch over on one of its next ticks. Two
  // shapes are healthy, because two paths are: it ACCEPTS the handover on a lock
  // whose process still runs, or it simply finds the lock free — a headless
  // `claude -p` exits at the boundary and SessionEnd releases it, so there is
  // nothing left to accept. What proves the link either way is the spawn.
  const after = launcher.filter((l) => l.at >= handover.at)
  const accepted = after.find((l) => l.kind === 'handover-accepted') ?? null
  const spawned = after.find((l) => l.kind === 'spawned' && (!accepted || l.at >= accepted.at)) ?? null
  // A skip is only evidence of failure once the grace it is entitled to has run
  // out — and `handover-grace` is never evidence at all: that IS the mechanism
  // waiting, on schedule.
  const blocked =
    after.find(
      (l) => (l.kind === 'skip-alive' || l.kind === 'skip-wedged') && l.at >= handover.at + graceMs,
    ) ?? null
  if (spawned) {
    links.push(
      link(
        'spawn',
        'the launcher takes the batch over and spawns',
        'pass',
        accepted ? `${accepted.line}\n          ${spawned.line}` : spawned.line,
        '',
      ),
    )
  } else if (accepted) {
    links.push(
      link(
        'spawn',
        'the launcher takes the batch over and spawns',
        'broken',
        `${accepted.line} — but no "launched pid" line followed`,
        'the acceptance is logged and the spawn is not: claude.exe missing, or the atomic acquire lost the race',
      ),
    )
    return { ok: false, links } // nothing downstream can be judged without a spawn
  } else if (blocked) {
    links.push(
      link(
        'spawn',
        'the launcher takes the batch over and spawns',
        'broken',
        `${blocked.line} — ${Math.round((blocked.at - handover.at) / 60000)} min after the handover, past its grace`,
        'THE MEASURED FAILURE: the launcher still reads a live owner. The handover did not reach the ' +
          'lock file, or it was withdrawn by a later tool call of the old session',
      ),
    )
    return { ok: false, links }
  } else {
    const mins = Math.round((now - handover.at) / 60000)
    const waiting = after.some((l) => l.kind === 'skip-grace')
    links.push(
      link(
        'spawn',
        'the launcher takes the batch over and spawns',
        'pending',
        waiting
          ? `the launcher is waiting out the handover grace (${mins} min in, ${Math.round(graceMs / 60000)} min wide)`
          : `no launcher tick logged in the ${mins} min since the handover (it runs every 15 min)`,
        'nothing at all appears in .claude/autostart.log → the scheduled task is not armed',
      ),
    )
    return { ok: false, links }
  }

  // 4. TAKEOVER — the SUCCESSOR owns the lock. The launcher's own
  // 'pending-spawn' lock is not that: it is the state in which the conversion
  // can still fail, so it counts as pending, never as a pass. And for the first
  // minutes after the spawn the child is simply booting.
  const describe = lock
    ? `lock held by ${lock.sessionId} (kind ${lock.kind ?? 'session'}, pid ${lock.pid ?? '?'}, ` +
      `heartbeat ${new Date(lock.claimedAt).toISOString()})`
    : 'no lock file at all'
  const converted =
    !!lock && lock.kind !== 'pending-spawn' && lock.sessionId !== handover.sid && Number(lock.claimedAt) >= handover.at
  const stillBooting = now - spawned.at < takeoverGraceMs
  const takeoverBroken =
    'the lock never became the successor\'s → the spawned session did not convert the pending-spawn lock ' +
    '(it stood down, or it died before its SessionStart hook ran)'
  if (converted) {
    links.push(link('takeover', 'the successor owns the batch lock', 'pass', describe, takeoverBroken))
  } else if (stillBooting) {
    links.push(
      link(
        'takeover',
        'the successor owns the batch lock',
        'pending',
        `${describe} — the successor was spawned ${Math.round((now - spawned.at) / 60000)} min ago and is still coming up`,
        takeoverBroken,
      ),
    )
    return { ok: false, links }
  } else {
    links.push(link('takeover', 'the successor owns the batch lock', 'broken', describe, takeoverBroken))
  }

  // 5. WORK — the successor committed something after it was spawned. This is
  // the ONE link a machine cannot close on its own: nothing in a commit names
  // the session that wrote it, so the observer reports the commit and the reader
  // confirms it is the successor's hand.
  const first = commits.filter((c) => c.at >= spawned.at).pop() ?? null
  links.push(
    link(
      'work',
      "the successor's first turn produces a commit",
      first ? 'pass' : 'pending',
      first
        ? `${first.sha.slice(0, 7)} ${first.subject} — confirm by eye that this is the successor's work`
        : `no commit on main since ${new Date(spawned.at).toISOString()}`,
      'the successor comes up and commits nothing → it stood down (lock), or resume-hook never oriented it',
    ),
  )

  return { ok: links.every((l) => l.status === 'pass'), links }
}
