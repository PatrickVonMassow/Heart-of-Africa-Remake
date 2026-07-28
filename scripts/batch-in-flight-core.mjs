// DECLARING WORK THAT IS IN FLIGHT (point 388, fifth live finding 28.07.2026) —
// the decision half, pure and dependency-injected.
//
// WHY: `batch-progress-guard` cannot see work that has been HANDED OUT. On
// 28.07.2026 a session with three delegated agents building and a browser suite
// running tried to end its turn eight times in a row and was blocked every time
// with "DO NOT STOP THE BATCH — continue the NEXT queue item now". It could not:
// the agent pool was at its cap and the next item needed the machine the suite
// was using. The guard's own text names polling as the sanctioned way to wait,
// but a polling session satisfies nothing it checks — so eight replies were
// written that reached nobody. The batch was not idle; the guard had no way to
// know.
//
// THE SHAPE, deliberately the one `prep-guard --prepped` already uses: the
// session DECLARES what it is waiting on, and the guard allows the stop while
// that work is PROVABLY still running. It is emphatically NOT a way to switch the
// block off — that block exists because the batch stood still for five and a half
// hours on the night of 28.07.2026, and an abandoned wait must not become an idle
// night. Three properties keep the two apart:
//
//   1. EVIDENCE, NOT ASSERTION — and RECENCY, never mere existence. A declaration
//      names things a probe can answer, and each answer must be FRESH: a pid whose
//      process is alive AND started when the declaration says (a reused pid is a
//      stranger), a branch whose tip commit is recent, a worktree where git work
//      recently happened, a log still being written to. Existence alone was the
//      one real hole the four-eyes review found — ~94 stale branches in this
//      repository would each have passed forever.
//   2. ALL of it must check out, not some. When one of three agents finishes, the
//      declaration stops holding and the guard blocks again — which is right: the
//      finished agent's work is now the session's next action (merge it), and
//      re-declaring the remaining two is one command. Erring the other way would
//      let a session sleep behind an evidence list it long outgrew.
//   3. IT EXPIRES. Past `IN_FLIGHT_MAX_AGE_MS` the guard blocks exactly as
//      before, whatever the declaration says and however live its evidence looks.
//      A wait that outlives the work it was declared for is an idle night with
//      paperwork.
//
// Where the two verdicts are close, this file chooses the BLOCK: a wrong block
// costs one command, a wrong allow cost five and a half hours.
import { resolveOwnership, PID_START_TOLERANCE_MS } from './batch-singleton.mjs'

/** How old a declaration may be before the guard stops honouring it. Wide enough
 *  for a LARGE browser regression or a delegated agent building a point (both run
 *  well past half an hour), short enough that a forgotten declaration cannot
 *  cover a night. Calibratable via HOA_IN_FLIGHT_MAX_MIN (scripts/batch-in-flight.mjs). */
export const IN_FLIGHT_MAX_AGE_MS = 45 * 60 * 1000

/** How recently a declared LOG file must have been written to count as proof that
 *  the run behind it is alive. A suite that has not appended a line in this long
 *  is not something to keep waiting on without saying so again. */
export const LOG_FRESH_MS = 15 * 60 * 1000

/**
 * The same question for a BRANCH and a WORKTREE: how recently work must have
 * landed in it. EXISTENCE IS NOT EVIDENCE (four-eyes review, 28.07.2026) — this
 * repository carries ~94 `feat/*` and `worktree-agent-*` branches, many of them
 * days old, so a declaration naming any of them would have passed the up-front
 * check AND every re-proving, held its full 45 minutes and been renewable with
 * one command. That was the single "yes" to "can this switch the block off", and
 * it sat on the COMMON path: the guard's block message steers sessions to exactly
 * these two kinds. So they are judged the way the log kind already was — by
 * recency. A delegated agent commits per step, so a quarter of an hour without a
 * commit or a git operation in its tree means it is finished, stuck or gone;
 * whichever it is, the session's next action is to look, not to keep waiting.
 */
export const WORK_FRESH_MS = 15 * 60 * 1000

/** The evidence kinds a probe can actually answer. An unknown kind is never
 *  "assume fine": it fails, and the declaration with it. */
export const EVIDENCE_KINDS = ['pid', 'branch', 'worktree', 'log']

/** Minutes, for the human-readable detail strings. */
const minutes = (ms) => Math.round(ms / 60000)

/**
 * ONE piece of evidence, checked. PURE — every probe is injected:
 *   probePid         — (pid) => { exists: boolean, startedAt: number|null }
 *   refTipAt         — (ref) => number|null  epoch ms of the branch tip commit
 *   worktreeActiveAt — (path) => number|null epoch ms of the last git activity
 *   mtimeOf          — (path) => number|null epoch ms, null when absent
 *
 * EVERY kind is now judged on RECENCY, not on existence — a pid by the identity
 * of the process behind it, the other three by when something last happened.
 *
 * Returns { ok, kind, describe, detail } — `describe` is what the guard's allow
 * message says out loud, so a later reader of the transcript can see what the
 * turn ended on.
 */
export function checkEvidence(
  item,
  {
    now,
    probePid,
    refTipAt,
    worktreeActiveAt,
    mtimeOf,
    logFreshMs = LOG_FRESH_MS,
    workFreshMs = WORK_FRESH_MS,
    tolerance = PID_START_TOLERANCE_MS,
  } = {},
) {
  const kind = String(item?.kind ?? '')
  const label = typeof item?.label === 'string' && item.label.trim() ? ` (${item.label.trim()})` : ''
  const no = (describe, detail) => ({ ok: false, kind, describe, detail })
  const yes = (describe, detail) => ({ ok: true, kind, describe, detail })
  const window = (fallback) => (Number.isFinite(item?.freshMs) && item.freshMs > 0 ? item.freshMs : fallback)

  if (kind === 'pid') {
    const pid = Number(item.pid)
    if (!Number.isInteger(pid) || pid <= 0) return no(`pid ${item.pid}${label}`, 'not-a-pid')
    const probe = probePid ? probePid(pid) : null
    if (!probe || probe.exists !== true) return no(`pid ${pid}${label}`, 'process-gone')
    // IDENTITY, not just existence (four-eyes review): a pid is reused within
    // hours on a busy machine, and an exists-only probe would keep a declaration
    // alive on a stranger's process. Recorded at declaration time and compared
    // the way `resolveOwnership` compares the lock's.
    if (typeof item.startedAt !== 'number') return no(`pid ${pid}${label}`, 'no-start-time')
    if (typeof probe.startedAt !== 'number') return no(`pid ${pid}${label}`, 'start-time-unverifiable')
    if (Math.abs(probe.startedAt - item.startedAt) > tolerance) return no(`pid ${pid}${label}`, 'pid-reused')
    return yes(`pid ${pid}${label}`, 'alive')
  }
  if (kind === 'branch') {
    const ref = String(item.ref ?? '').trim()
    if (!ref) return no(`branch ?${label}`, 'no-ref')
    const tip = refTipAt ? refTipAt(ref) : null
    if (typeof tip !== 'number') return no(`branch ${ref}${label}`, 'branch-gone')
    const idle = now - tip
    return idle <= window(workFreshMs)
      ? yes(`branch ${ref}${label}`, `tip ${minutes(idle)} min old`)
      : no(`branch ${ref}${label}`, `no commit for ${minutes(idle)} min`)
  }
  if (kind === 'worktree') {
    const path = String(item.path ?? '').trim()
    if (!path) return no(`worktree ?${label}`, 'no-path')
    const active = worktreeActiveAt ? worktreeActiveAt(path) : null
    if (typeof active !== 'number') return no(`worktree ${path}${label}`, 'worktree-gone')
    const idle = now - active
    return idle <= window(workFreshMs)
      ? yes(`worktree ${path}${label}`, `active ${minutes(idle)} min ago`)
      : no(`worktree ${path}${label}`, `quiet for ${minutes(idle)} min`)
  }
  if (kind === 'log') {
    const path = String(item.path ?? '').trim()
    if (!path) return no(`log ?${label}`, 'no-path')
    const mtime = mtimeOf ? mtimeOf(path) : null
    if (typeof mtime !== 'number') return no(`log ${path}${label}`, 'log-missing')
    const idle = now - mtime
    return idle <= window(logFreshMs)
      ? yes(`log ${path}${label}`, `written ${Math.round(idle / 1000)}s ago`)
      : no(`log ${path}${label}`, `silent for ${minutes(idle)} min`)
  }
  return no(`${kind || 'unnamed'}${label}`, 'unknown-kind')
}

/**
 * IS THE DECLARED WORK PROVABLY STILL RUNNING? PURE.
 *
 * Inputs:
 *   declaration — the parsed marker, or null
 *   sid         — the session id the Stop hook was called with
 *   ancestor    — { pid, startedAt } of the claude process we run under, or null.
 *                 Ownership is resolved by `resolveOwnership` — the SAME notion
 *                 the lock uses — so a context compaction that mints a new
 *                 session id does not orphan a declaration this very process
 *                 wrote, while a genuinely second window still fails it.
 *   now, maxAgeMs, and the four probes of `checkEvidence`.
 *
 * Returns { live, reason, ageMs, summary, items }. `live` true is the ONLY value
 * that may relax the block; every other path leaves the guard exactly as it was.
 */
export function assessInFlight({
  declaration,
  sid,
  ancestor = null,
  now,
  maxAgeMs = IN_FLIGHT_MAX_AGE_MS,
  ...probes
} = {}) {
  const out = (live, reason, extra = {}) => ({ live, reason, ageMs: null, summary: '', items: [], ...extra })
  if (!declaration || typeof declaration !== 'object') return out(false, 'no-declaration')
  if (typeof declaration.at !== 'number') return out(false, 'malformed')

  // Only for the session that WROTE it — and by the lock's own identity rules,
  // never a second notion of liveness invented here.
  const owner = resolveOwnership({ lock: declaration, sessionId: sid, ancestor })
  if (!owner.mine) return out(false, `not-mine:${owner.via}`)

  const ageMs = now - declaration.at
  // A declaration from the future is a clock the guard cannot reason about →
  // block. Costs one re-declaration; the other direction costs a night.
  if (!(ageMs >= 0)) return out(false, 'clock-skew', { ageMs })
  if (ageMs > maxAgeMs) return out(false, 'expired', { ageMs })

  const evidence = Array.isArray(declaration.evidence) ? declaration.evidence : []
  if (evidence.length === 0) return out(false, 'no-evidence', { ageMs })

  const items = evidence.map((e) => checkEvidence(e, { now, ...probes }))
  const dead = items.filter((i) => !i.ok)
  const summary = items.map((i) => `${i.describe} — ${i.detail}`).join('; ')
  if (dead.length > 0) return out(false, 'evidence-gone', { ageMs, summary, items })
  return out(true, 'live', { ageMs, summary, items })
}

/**
 * Details that mean A PROBE COULD NOT ANSWER, as opposed to answering "gone".
 * A declaration nobody can check is not proof of anything — it is treated as no
 * evidence at all (point 402), never as a reason to keep an owner alive.
 */
export const UNANSWERABLE_DETAILS = new Set([
  'unknown-kind',
  'not-a-pid',
  'no-ref',
  'no-path',
  'no-start-time',
  'start-time-unverifiable',
])

/**
 * IS THE LOCK OWNER'S DECLARED WORK STILL ADVANCING? PURE.
 *
 * The LAUNCHER's question, and it is not the guard's. `assessInFlight` asks "may
 * THIS session end its turn", so it demands that ALL evidence still holds and
 * that the declaration has not aged out. The launcher asks the narrower one that
 * decides whether a silent owner is working or wedged (point 402 (c)): is ANY of
 * the declared work still moving? A session with three agents out and two of them
 * finished is plainly alive, and shooting it would be the exact failure this
 * whole point exists to end.
 *
 * Same probes, same `checkEvidence`, same ownership rules — nothing about
 * liveness is re-invented here.
 *
 * Inputs:
 *   declaration — the parsed `.claude/batch-in-flight.json`, or null
 *   lock        — the parsed batch lock, whose owner the declaration must belong to
 *   now, maxAgeMs, and the four probes of `checkEvidence`
 *
 * Returns { declared, advancing, reason, summary, items }:
 *   advancing — something the declaration names moved inside its freshness window.
 *               Judged on the EVIDENCE alone, so it holds however old the
 *               declaration is: an agent that is still committing is still
 *               building, whatever the paperwork's timestamp says.
 *   declared  — there is a CURRENT declaration, so its silence means something.
 *               Goes false once the declaration ages past `maxAgeMs`, and that is
 *               deliberate: a stale declaration says nothing about what the
 *               session is doing NOW (it may well be inside one long verification
 *               run), so it must not be allowed to tighten the wedge bound.
 */
export function assessOwnerWork({ declaration, lock, now, maxAgeMs = IN_FLIGHT_MAX_AGE_MS, ...probes } = {}) {
  const out = (o) => ({ declared: false, advancing: false, reason: 'no-declaration', summary: '', items: [], ...o })
  if (!declaration || typeof declaration !== 'object' || typeof declaration.at !== 'number') return out({})
  if (!lock || typeof lock.sessionId !== 'string') return out({ reason: 'no-lock' })

  const owner = resolveOwnership({
    lock: declaration,
    sessionId: lock.sessionId,
    ancestor: typeof lock.pid === 'number' && lock.pid > 0 ? { pid: lock.pid, startedAt: lock.pidStartedAt ?? null } : null,
  })
  if (!owner.mine) return out({ reason: `not-owners:${owner.via}` })

  const ageMs = now - declaration.at
  // A declaration from the future is a clock this cannot reason about → the same
  // as an aged-out one: no bearing on the present.
  const current = ageMs >= 0 && ageMs <= maxAgeMs

  const evidence = Array.isArray(declaration.evidence) ? declaration.evidence : []
  if (evidence.length === 0) return out({ declared: current, reason: 'no-evidence' })

  const items = evidence.map((e) => checkEvidence(e, { now, ...probes }))
  const summary = items.map((i) => `${i.describe} — ${i.detail}`).join('; ')
  const answerable = items.filter((i) => !UNANSWERABLE_DETAILS.has(i.detail))
  if (answerable.length === 0) return out({ declared: current, reason: 'unanswerable', summary, items })

  const advancing = answerable.some((i) => i.ok)
  return out({
    declared: current,
    advancing,
    reason: advancing ? 'advancing' : current ? 'no-progress' : 'expired',
    summary,
    items,
  })
}

/** The one line the guard puts in the boundary log and in its allow message. */
export function describeInFlight(assessment, declaration) {
  const what = declaration?.waitingOn ? String(declaration.waitingOn) : 'in-flight work'
  const mins = Number.isFinite(assessment?.ageMs) ? Math.round(assessment.ageMs / 60000) : null
  const age = mins === null ? '' : ` (declared ${mins} min ago)`
  return `${what}${age}: ${assessment?.summary || 'no evidence'}`
}
