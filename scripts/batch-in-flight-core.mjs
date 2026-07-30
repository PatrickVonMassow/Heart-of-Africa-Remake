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
//   3. IT ENDS WITH THE WORK, not on a clock somebody has to feed (point 434
//      (6b), 30.07.2026). A wait that outlives the work it was declared for is
//      an idle night with paperwork — but the wall clock was the wrong instrument
//      for saying so: on 29.07.2026 the declaration read `live:false, expired`
//      while its agent had been building for 63 minutes and was mid-merge, and
//      nothing refreshes a declaration while the work runs. What ends the wait is
//      the EVIDENCE going quiet: output (a branch, a worktree) stops checking out
//      within `WORK_FRESH_MS` of the last commit, all by itself. Past
//      `IN_FLIGHT_MAX_AGE_MS` the guard blocks exactly as before wherever nothing
//      is producing output — a pid that merely exists, a log that is merely
//      appended to — so the clock still bounds the assertion-shaped evidence it
//      was written for.
//
// Where the two verdicts are close, this file chooses the BLOCK: a wrong block
// costs one command, a wrong allow cost five and a half hours.
import { resolveOwnership, PID_START_TOLERANCE_MS } from './batch-singleton.mjs'
import { CLOSING_STEPS, missingSteps } from './closing-guard-core.mjs'

/** How old a declaration may be before the guard stops honouring it — where
 *  nothing in it is producing OUTPUT (point 434 (6b); a declaration whose branch
 *  or worktree still moves is judged on that instead and does not age out). Wide
 *  enough for a LARGE browser regression or a delegated agent building a point
 *  (both run well past half an hour), short enough that a forgotten declaration
 *  cannot cover a night. Calibratable via HOA_IN_FLIGHT_MAX_MIN
 *  (scripts/batch-in-flight.mjs). */
export const IN_FLIGHT_MAX_AGE_MS = 45 * 60 * 1000

/**
 * THE WINDOW THE LAUNCHER MUST ASK WITH — and the reason the guard's own is wrong
 * for it (second four-eyes review, 28.07.2026, finding A).
 *
 * `work-stalled` was UNREACHABLE in production. Three constants made it so, and
 * each was defensible alone:
 *   - `assessOwnerWork` marks a declaration `declared: false` once it is older
 *     than `IN_FLIGHT_MAX_AGE_MS` (45 min);
 *   - `assessOwner` licenses the stall verdict only past `WORK_STALL_MS` (90 min)
 *     of heartbeat silence;
 *   - and only while the declaration is the owner's LAST WORD, i.e.
 *     `claimedAt <= declaredAt + WORK_DECLARATION_TOLERANCE_MS`.
 * The declare CLI is itself a tool call, so its own PostToolUse heartbeat lands
 * seconds after `declaration.at` — which means in the honest stall shape the
 * heartbeat age and the declaration age are the SAME number. It cannot be above
 * 90 and below 45 at once, so the verdict never fired: the reviewer drove the real
 * pipeline minute by minute over five hours after a total freeze and got the old
 * four-hour valve every time.
 *
 * The launcher's question is not the guard's. The guard asks "may a turn end ride
 * on this declaration?", where an aged one must stop counting. The launcher asks
 * "is this declaration the owner's LAST WORD?" — and for that, age is not the
 * disqualifier: `lastWord` already excludes every session that worked after
 * declaring, which is the only way an old declaration becomes misleading (the
 * replayed near-kill — declare, agent finishes, merge, start a LARGE regression —
 * leaves a heartbeat twelve minutes newer than the declaration and fails it).
 *
 * WHY NOT JUST `WORK_STALL_MS + WORK_DECLARATION_TOLERANCE_MS`, the minimum that
 * makes the window non-empty: because non-empty is not the same as REACHABLE. In
 * the honest stall shape the heartbeat age and the declaration age are the same
 * number, so that value opens a band barely two minutes wide — and the launcher
 * only looks once per `LAUNCHER_TICK_MS` (15 min). Roughly seven ticks in eight
 * would step straight over it and fall through to the four-hour valve, which is
 * the very outcome finding A reported. The band must therefore be at least a
 * couple of ticks wide, and four hours is where it naturally ends: past that a
 * silent owner has been read as wedged for hours anyway, so the declaration has
 * nothing left to add. `assessOwnerWork`'s own tests pin the width against the tick.
 *
 * WRITTEN OUT RATHER THAN `= WEDGED_MS` (point 433, 30.07.2026). It used to borrow
 * that constant, which then dropped from four hours to 45 minutes so the launcher
 * could rescue an unattended night. Borrowed, this window would have collapsed to
 * 45 minutes with it — and since a declaration ageing out flips `advancing` to
 * false, the launcher would have started TAKING the lock the moment a declaration
 * expired. That is precisely the shot in the back a long verification must never
 * get: an expiry is not evidence of a wedge. The window therefore keeps its own
 * value and its own reason.
 */
export const LAUNCHER_WORK_MAX_AGE_MS = 4 * 60 * 60 * 1000

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

/**
 * EVIDENCE THAT IS THE WORK'S OWN OUTPUT (point 434 (5), 30.07.2026).
 *
 * The four kinds were weighed EQUALLY, and on 30.07.2026 that cost two finished
 * points. A bundle agent's transcript log had been silent for 59 minutes, this
 * file answered `evidence-gone: silent for 59 min`, the agent was declared dead
 * and replaced — while its worktree had committed four minutes earlier and its
 * branch tip moved one minute before the replacement was spawned. The successor
 * rebuilt two points the original had already finished.
 *
 * A LOG is the weakest of the four: an agent that works without printing looks
 * exactly like one that died. A PID is stronger but says only that a process
 * exists, not that it is producing anything. A BRANCH and a WORKTREE are the
 * work's own OUTPUT — they move only when something real happened, and they go
 * quiet on their own the moment it stops. So they are the PRIMARY evidence: a
 * silent log beside moving output never supports the conclusion "dead", and
 * output that is still moving needs no deadline to stay honest (see
 * `assessInFlight`).
 */
export const OUTPUT_KINDS = new Set(['branch', 'worktree'])

/**
 * WHICH EVIDENCE CARRIES THE VERDICT? PURE.
 *
 * `items` is the output of `checkEvidence`, one per declared piece. Returns
 * { judgedOn, outputFresh, fresh, silent } — `judgedOn` is the strongest kind
 * that still checks out ('git' > 'process' > 'log', 'none' when nothing does),
 * and it is REPORTED wherever a verdict is printed, because the 30.07 mistake
 * was not visible in the verdict itself: "evidence-gone" named a log without
 * ever saying that a stronger source had been asked and had answered.
 */
export function evidenceVerdict(items = []) {
  const list = Array.isArray(items) ? items : []
  const ok = list.filter((i) => i?.ok === true)
  const outputFresh = ok.some((i) => OUTPUT_KINDS.has(i.kind))
  const judgedOn = outputFresh ? 'git' : ok.some((i) => i.kind === 'pid') ? 'process' : ok.length > 0 ? 'log' : 'none'
  return {
    judgedOn,
    outputFresh,
    fresh: ok.map((i) => `${i.describe} — ${i.detail}`),
    silent: list.filter((i) => i?.ok !== true).map((i) => `${i.describe} — ${i.detail}`),
  }
}

/** Branch refs that can never be evidence of a DELEGATED agent's progress,
 *  whatever the declaring session names them (four-eyes review 28.07.2026,
 *  finding 1.2). `main` moves on everyone else's merges, and `HEAD` — for which
 *  `@` is git's own alias (second review, finding B; it walked straight past the
 *  refusal) — is the declaring checkout itself. */
const ALWAYS_REFUSED_REFS = new Set(['main', 'head', '@'])

/** Compare a filesystem path the way both Windows and git will: separators
 *  normalised, trailing separators dropped, case folded. */
const normPath = (p) =>
  String(p ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()

/**
 * `refs/heads/x`, `heads/x`, `origin/x`, `x` and `x@{0}` all name the same thing
 * for this purpose. The last three spellings are not pedantry: `heads/main` and
 * `main@{0}` both resolve to main and both walked past the refusal until the
 * second four-eyes review drove them live (finding B). This is the BELT — the CLI
 * additionally resolves every declared ref through `git rev-parse
 * --symbolic-full-name` and refuses on the resolved name, which catches the
 * spellings no string rule can enumerate; this rule is what still holds when git
 * cannot resolve the ref at all.
 */
const normRef = (r) =>
  String(r ?? '')
    .trim()
    .replace(/@\{[^}]*\}$/, '')
    .replace(/^refs\/(heads|remotes)\//, '')
    .replace(/^heads\//, '')
    .replace(/^origin\//, '')
    .toLowerCase()

/**
 * EVIDENCE THAT PROVES NOTHING BECAUSE IT CANNOT GO QUIET. PURE.
 *
 * Recency made existence-only evidence honest (point 388's own four-eyes round),
 * but nothing restricted WHAT may be named — and some things are eternally fresh
 * by construction (four-eyes review 28.07.2026, finding 1.2):
 *   - the REPO ROOT as a `--worktree`: every `git status` the declaring session
 *     runs touches its index, so it is git-active at all times, by the session's
 *     own hand;
 *   - `main`, or the declaring checkout's OWN current branch, as a `--branch`:
 *     the first moves on everyone else's merges, the second on the session's own
 *     commits.
 * Either one would hold a declaration open indefinitely — and because the
 * declaration also suppressed the silent-owner notification, naming one left the
 * session LESS observed than declaring nothing at all. They are refused at
 * declaration time, where the mistake is one command away from being fixed,
 * rather than silently honoured for hours.
 *
 * Inputs are plain data: the evidence array, the resolved repo root and the
 * declaring checkout's current branch (null when it cannot be determined — an
 * unknown branch refuses nothing extra, it just cannot add the second rule).
 * Returns [{ kind, value, why }], empty when everything may be declared.
 */
export function selfReferentialEvidence({ evidence, repoRoot, currentBranch = null } = {}) {
  const root = normPath(repoRoot)
  const own = normRef(currentBranch)
  const out = []
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (item?.kind === 'worktree') {
      if (root && normPath(item.path) === root) {
        out.push({
          kind: 'worktree',
          value: String(item.path),
          why: 'that is this checkout itself — every git command the session runs keeps it fresh forever',
        })
      }
    } else if (item?.kind === 'branch') {
      const ref = normRef(item.ref)
      if (!ref) continue
      if (ALWAYS_REFUSED_REFS.has(ref)) {
        out.push({
          kind: 'branch',
          value: String(item.ref),
          why: 'main (and HEAD) move on every merge in the repository, not on the work being waited for',
        })
      } else if (own && ref === own) {
        out.push({
          kind: 'branch',
          value: String(item.ref),
          why: `that is this checkout's own current branch (${currentBranch}) — the session's own commits keep it fresh`,
        })
      }
    }
  }
  return out
}

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
 * Returns { live, reason, ageMs, summary, items, judgedOn, ignored }. `live` true
 * is the ONLY value that may relax the block; every other path leaves the guard
 * exactly as it was. `judgedOn` names the evidence the verdict rests on, so a
 * transcript reader can see whether a log or the work's own output decided it.
 *
 * TWO RULES COME FROM POINT 434 (30.07.2026), and both say the same thing —
 * liveness is read from OUTPUT, never from a clock and never from silence:
 *   (5) A SILENT LOG ALONE IS NOT DEATH. Where the declared work is an agent
 *       whose branch or worktree is still moving, a log that has gone quiet is
 *       ignored (and named in `ignored`). Every other kind still has to hold —
 *       a dead pid, a stalled branch or a quiet worktree blocks as before.
 *   (6b) MOVING OUTPUT DOES NOT AGE OUT. The declaration used to expire after 45
 *       minutes and was never refreshed while the work ran, so on 29.07.2026 it
 *       read `live:false, expired` while its agent had been building for 63
 *       minutes and was mid-merge. The expiry now only bites where nothing is
 *       producing output — a pid that merely exists, a log that is merely being
 *       written. Fresh output needs no deadline: it goes quiet on its own inside
 *       `WORK_FRESH_MS`, which is the bound the expiry was standing in for.
 */
export function assessInFlight({
  declaration,
  sid,
  ancestor = null,
  now,
  maxAgeMs = IN_FLIGHT_MAX_AGE_MS,
  ...probes
} = {}) {
  const out = (live, reason, extra = {}) => ({
    live,
    reason,
    ageMs: null,
    summary: '',
    items: [],
    judgedOn: 'none',
    ignored: [],
    ...extra,
  })
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

  const evidence = Array.isArray(declaration.evidence) ? declaration.evidence : []
  if (evidence.length === 0) return out(false, 'no-evidence', { ageMs })

  const items = evidence.map((e) => checkEvidence(e, { now, ...probes }))
  const verdict = evidenceVerdict(items)
  const summary = items.map((i) => `${i.describe} — ${i.detail}`).join('; ')
  const base = { ageMs, summary, items, judgedOn: verdict.judgedOn }
  // The clock is the FALLBACK bound, not the rule (see the header): it decides
  // only where no output is moving.
  if (ageMs > maxAgeMs && !verdict.outputFresh) return out(false, 'expired', base)

  const dead = items.filter((i) => !i.ok)
  if (dead.length > 0) {
    const silentLogsOnly = dead.every((i) => i.kind === 'log')
    if (!(silentLogsOnly && verdict.outputFresh)) return out(false, 'evidence-gone', base)
    // A quiet log beside output that is still moving. Reported, never fatal.
    return out(true, 'live', { ...base, ignored: verdict.silent })
  }
  return out(true, 'live', base)
}

// ---------------------------------------------------------------------------
// NEVER REPLACE AN AGENT WITHOUT ASKING ITS OUTPUT FIRST (point 434 (5))
// ---------------------------------------------------------------------------
//
// The declaration above decides whether a WAIT may continue. This decides the
// costlier question: may a delegated agent be declared dead and RESPAWNED? On
// 30.07.2026 that was answered from a transcript log ("silent for 59 min") while
// the agent's worktree had committed four minutes earlier, and the successor
// rebuilt two finished points. So the answer is read from the work's own output,
// and it is re-read IMMEDIATELY before the spawn — an agent that committed while
// the decision was being made must not be shot by a stale reading.

/** How long an agent's output may stand still before a replacement is even
 *  considered. Deliberately WIDER than `WORK_FRESH_MS`, because the two decisions
 *  have opposite cost shapes: ending a wait too early costs one command, while
 *  killing a live agent costs everything it has built and un-does it twice (the
 *  original's work plus the successor's). */
export const RESPAWN_GRACE_MS = 30 * 60 * 1000

/**
 * IS A DELEGATED AGENT STILL PRODUCING? PURE — every stamp is injected as epoch
 * ms, or null where the probe could not answer.
 *
 * Returns { verdict, judgedOn, ageMs, detail }:
 *   'alive'        — something moved inside the grace window. `judgedOn` names
 *                    what: 'git' (its worktree or branch) or 'log'.
 *   'quiet'        — git output COULD be measured and has stood still.
 *   'unmeasurable' — neither a worktree nor a branch could be read, so the only
 *                    thing left is silence, and silence is not evidence of death
 *                    (docs/batch-resilience.md §5). The caller must LOOK.
 */
export function agentOutputVerdict({
  worktreeAt = null,
  branchTipAt = null,
  logAt = null,
  now,
  graceMs = RESPAWN_GRACE_MS,
} = {}) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const git = [num(worktreeAt), num(branchTipAt)].filter((v) => v !== null)
  const log = num(logAt)
  const newestGit = git.length > 0 ? Math.max(...git) : null
  if (newestGit !== null && now - newestGit <= graceMs) {
    return {
      verdict: 'alive',
      judgedOn: 'git',
      ageMs: now - newestGit,
      detail: `git output ${minutes(now - newestGit)} min old`,
    }
  }
  if (log !== null && now - log <= graceMs) {
    // The log is the weakest source, but a FRESH one still means something is
    // happening — it is only SILENCE that proves nothing.
    return { verdict: 'alive', judgedOn: 'log', ageMs: now - log, detail: `log written ${minutes(now - log)} min ago` }
  }
  if (newestGit === null) {
    return { verdict: 'unmeasurable', judgedOn: 'none', ageMs: null, detail: 'no worktree and no branch could be read' }
  }
  return {
    verdict: 'quiet',
    judgedOn: 'git',
    ageMs: now - newestGit,
    detail: `no commit and no git activity for ${minutes(now - newestGit)} min`,
  }
}

/**
 * MAY THIS AGENT BE REPLACED? PURE. Takes the verdict above.
 * Returns { respawn, reason, judgedOn, detail }.
 *
 * Only a measurable, quiet output permits it. 'alive' and 'unmeasurable' both
 * refuse — the second because "I could not look" must never read as "it is gone",
 * the same asymmetry `GIT_STATE_UNVERIFIABLE` enforces on the release side.
 */
export function respawnDecision({ output } = {}) {
  const o = output ?? { verdict: 'unmeasurable', judgedOn: 'none', detail: 'nothing probed' }
  if (o.verdict === 'alive') return { respawn: false, reason: 'agent-alive', judgedOn: o.judgedOn, detail: o.detail }
  if (o.verdict === 'quiet') return { respawn: true, reason: 'output-quiet', judgedOn: o.judgedOn, detail: o.detail }
  return { respawn: false, reason: 'output-unmeasurable', judgedOn: o.judgedOn ?? 'none', detail: o.detail ?? '' }
}

// ---------------------------------------------------------------------------
// THE POOL RUNS AT ITS CAP, OR SAYS WHY NOT (point 427, 29.07.2026)
// ---------------------------------------------------------------------------
//
// The user asked it plainly while one agent built and two slots stood empty: "Nur
// ein Punkt in Arbeit? Ist aktuell keine Parallelisierung sinnvoll?" Nothing was
// broken: the wait declaration is built and enforced, the idle guard is satisfied,
// and the cap is an UPPER bound that nothing checks from below. Measured that day:
// one agent, two free slots, ninety minutes, a queue full of independent points.
//
// So the mechanism that already judges the wait also asks the lower bound — and it
// must not become a nag, which is why every state in which the empty slots are
// genuinely unusable answers "no reason needed" on its own.

/** The delegation pool cap (CLAUDE.md §6): at most three concurrent agents — and
 *  since point 427 also a TARGET while independent work is queued. */
export const POOL_CAP = 3

/**
 * How many delegated agents the declaration's own evidence SHOWS. PURE.
 *
 * Counted from what can actually be seen rather than from a number the session
 * types: one agent normally declares both its worktree and its branch, so the
 * larger of the two distinct counts is the honest reading.
 */
export function declaredAgentCount(evidence = []) {
  const worktrees = new Set()
  const branches = new Set()
  for (const e of Array.isArray(evidence) ? evidence : []) {
    if (e?.kind === 'worktree' && e.path) worktrees.add(String(e.path).toLowerCase())
    if (e?.kind === 'branch' && e.ref) branches.add(String(e.ref).toLowerCase())
  }
  return Math.max(worktrees.size, branches.size)
}

/**
 * The repository files a point's spec NAMES. PURE.
 *
 * The overlap question — "would this queued point collide with the running branch"
 * — can only be answered from what the spec says it touches. A point that names
 * nothing is UNKNOWN, and unknown must never produce a demand: see
 * `independentOpenPoints`.
 */
export function filesNamedIn(text) {
  const out = new Set()
  const re = /\b(?:src|scripts|docs|public|verification)[\\/][\w.\-\\/]*\w/gi
  for (const m of String(text ?? '').matchAll(re)) out.add(normPath(m[0]))
  // Root-level documents the work order names without a directory.
  for (const m of String(text ?? '').matchAll(/\b(?:CLAUDE|design|TASKS|README)\.md\b/gi)) out.add(normPath(m[0]))
  return [...out]
}

/**
 * The OPEN points of the work order with the files each names. PURE.
 *
 * A point's block runs from its `- [ ] N.` line to the next checkbox line, which is
 * how the work order is written; DEFERRED points are excluded exactly as
 * `openPointStatus` excludes them, since a deferred point is not commissionable.
 */
export function openPointSpecs(tasksText = '') {
  const out = []
  let current = null
  for (const line of String(tasksText ?? '').split('\n')) {
    const head = line.match(/^- \[( |x)\] (\d+)\./)
    if (head) {
      if (current) out.push(current)
      current =
        head[1] === ' ' && !/\bDEFERRED\b/.test(line) ? { point: Number(head[2]), text: line } : null
      continue
    }
    if (current) current.text += `\n${line}`
  }
  if (current) out.push(current)
  return out.map((p) => ({ point: p.point, files: filesNamedIn(p.text) }))
}

/**
 * Which open points could be commissioned RIGHT NOW, beside the running work? PURE.
 *
 * `points` is [{ point, files }]; `runningFiles` is what the running branch touches.
 * A point counts as a candidate only when it names files AND none of them is in the
 * running set. Both exclusions err toward SILENCE — a point whose spec names nothing
 * is not evidence that a slot is wastable.
 */
export function independentOpenPoints({ points = [], runningFiles = [] } = {}) {
  const running = new Set((Array.isArray(runningFiles) ? runningFiles : []).map(normPath).filter(Boolean))
  return (Array.isArray(points) ? points : []).filter((p) => {
    const files = (Array.isArray(p?.files) ? p.files : []).map(normPath).filter(Boolean)
    if (files.length === 0) return false
    return !files.some((f) => running.has(f) || [...running].some((r) => r.startsWith(`${f}/`) || f.startsWith(`${r}/`)))
  })
}

/**
 * IS A CLOSING FREEZE UNDER WAY? PURE.
 *
 * CLAUDE.md §9 freezes the code during a closing run: nothing may land or merge, so
 * empty pool slots are not waste but the rule. The question is how a machine KNOWS —
 * and the answer must not be a file nobody writes. `.claude/closing-freeze` is
 * honoured as a deliberate manual declaration, but the reachable signal is the state
 * the closing guard ALREADY keeps: `.claude/closing-state.json` is keyed to the exact
 * commit being closed, so a state naming the current HEAD with at least one recorded
 * step means a closing is running on this very tree. Nothing new to remember.
 *
 * It errs toward SILENCE, deliberately: the state survives the tag, so on a HEAD
 * whose closing has finished this still answers "frozen" until HEAD moves. That
 * suppresses a nudge for a few minutes — the harmless direction. The costly
 * direction would be nagging a session mid-closing to commission more work, which
 * is exactly what the freeze forbids.
 *
 * Returns { active, why }.
 */
export function closingFreezeActive({ marker = false, closingState = null, head = '' } = {}) {
  if (marker === true) return { active: true, why: 'freeze-marker' }
  const recorded = CLOSING_STEPS.length - missingSteps(closingState, String(head ?? '')).length
  return recorded > 0 ? { active: true, why: 'closing-state-for-head' } : { active: false, why: 'none' }
}

/**
 * MUST THIS WAIT EXPLAIN ITS IDLE SLOTS? PURE.
 *
 * Returns { needsReason, slotsFree, agents, candidates, why }. Every "no" carries
 * the state that decided it, so the guard's message can say which one applied.
 */
export function slotReasonDecision({
  agents = 0,
  openPoints = [],
  runningFiles = [],
  reason = '',
  paused = false,
  closingFreeze = false,
  cap = POOL_CAP,
} = {}) {
  const running = Number.isFinite(agents) && agents > 0 ? Math.floor(agents) : 0
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : POOL_CAP
  const slotsFree = Math.max(0, limit - running)
  const candidates = independentOpenPoints({ points: openPoints, runningFiles })
  const no = (why) => ({ needsReason: false, slotsFree, agents: running, candidates, why })
  // A paused batch and a closing freeze are states in which commissioning MORE work
  // would be wrong — the freeze exists so the closing tests the final state.
  if (paused === true) return no('paused')
  if (closingFreeze === true) return no('closing-freeze')
  if (slotsFree === 0) return no('at-cap')
  if (candidates.length === 0) return no('queue-overlaps')
  if (String(reason ?? '').trim()) return no('reason-given')
  return { needsReason: true, slotsFree, agents: running, candidates, why: 'idle-slots' }
}

/**
 * The guard's remedy for unexplained idle slots. PURE, so the wording is pinned
 * rather than left to a script — the point requires it to name BOTH honest answers.
 */
export function slotsRemedy({ slots = {}, cap = POOL_CAP } = {}) {
  const names = (Array.isArray(slots.candidates) ? slots.candidates : [])
    .slice(0, 8)
    .map((c) => c?.point)
    .filter((p) => p != null)
    .join(', ')
  return (
    `THE AGENT POOL IS BELOW ITS CAP AND NOTHING SAYS WHY: ${slots.agents ?? 0} agent(s) running, ` +
    `${slots.slotsFree ?? 0} of ${cap} slots FREE, and the queue holds independent open point(s) that touch none of ` +
    `the running branch's files (${names || 'see the work order'}). The declared wait is fine; the idle slots are ` +
    'not accounted for. TWO honest answers: (a) COMMISSION another point into a free slot — a worktree-isolated ' +
    'agent on its own feat/<point>-<slug> branch, on files the running work does not touch; or (b) STATE what ' +
    'makes the queue\'s next points unsuitable right now: `node scripts/batch-in-flight.mjs --waiting-on "<what>" ' +
    '<evidence> --slots-free "<why>"` (file overlap with the running branch, a closing freeze, a user pause are ' +
    'all valid reasons). A paused batch, a recorded closing freeze and a full pool need no reason at all.'
  )
}

/**
 * WHAT `--status` MUST SAY. PURE.
 *
 * The command advertises itself as "what the Stop hook would decide", and point 427
 * gave the hook a SECOND way to block: a declaration whose evidence checks out
 * perfectly while the free pool slots are unaccounted for. The CLI's old two-branch
 * print keyed on `live` alone and would have called that state ALLOWED — a status
 * that lies is worse than no status at all, because the session checks it, believes
 * it, and then walks into the very block it just asked about.
 *
 * Returns { verdict: 'none' | 'allowed' | 'blocked', why }: the machine reason only,
 * so the prose (and the remedy) stays in the CLI where the wording belongs.
 */
export function statusVerdict({ declaration = null, live = false, reason = '', slots = null } = {}) {
  if (!declaration) return { verdict: 'none', why: 'no-declaration' }
  if (live !== true) return { verdict: 'blocked', why: String(reason || 'not-live') }
  if (slots?.needsReason === true) return { verdict: 'blocked', why: 'slots-free' }
  return { verdict: 'allowed', why: 'live' }
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
 * Returns { declared, advancing, declaredAt, reason, summary, items }:
 *   advancing  — something the declaration names moved inside its freshness window.
 *                Judged on the EVIDENCE alone, so it holds however old the
 *                declaration is: an agent that is still committing is still
 *                building, whatever the paperwork's timestamp says.
 *   declared   — there is a CURRENT declaration, so its silence means something.
 *                Goes false once the declaration ages past `maxAgeMs`, and that is
 *                deliberate: a stale declaration says nothing about what the
 *                session is doing NOW (it may well be inside one long verification
 *                run), so it must not be allowed to tighten the wedge bound.
 *                `maxAgeMs` defaults to `LAUNCHER_WORK_MAX_AGE_MS`, NOT to the
 *                guard's `IN_FLIGHT_MAX_AGE_MS`: with the guard's 45 minutes here
 *                the stall verdict this feeds is arithmetically unreachable (see
 *                that constant). The staleness that actually matters — a session
 *                that went on working after declaring — is caught by `lastWord`
 *                in `assessOwner`, not by this clock.
 *   declaredAt — WHEN it was declared, passed through so `assessOwner` can ask the
 *                second question the four-eyes review found missing (finding 1.1):
 *                is this declaration still the owner's LAST WORD, or did the
 *                session go on working after writing it? A heartbeat newer than
 *                `declaredAt` answers that without any new notion of liveness.
 */
export function assessOwnerWork({ declaration, lock, now, maxAgeMs = LAUNCHER_WORK_MAX_AGE_MS, ...probes } = {}) {
  const out = (o) => ({
    declared: false,
    advancing: false,
    declaredAt: null,
    reason: 'no-declaration',
    summary: '',
    items: [],
    judgedOn: 'none',
    ...o,
  })
  if (!declaration || typeof declaration !== 'object' || typeof declaration.at !== 'number') return out({})
  if (!lock || typeof lock.sessionId !== 'string') return out({ reason: 'no-lock' })

  const owner = resolveOwnership({
    lock: declaration,
    sessionId: lock.sessionId,
    ancestor: typeof lock.pid === 'number' && lock.pid > 0 ? { pid: lock.pid, startedAt: lock.pidStartedAt ?? null } : null,
  })
  if (!owner.mine) return out({ reason: `not-owners:${owner.via}` })

  const declaredAt = declaration.at
  const ageMs = now - declaredAt
  // A declaration from the future is a clock this cannot reason about → the same
  // as an aged-out one: no bearing on the present.
  const current = ageMs >= 0 && ageMs <= maxAgeMs

  const evidence = Array.isArray(declaration.evidence) ? declaration.evidence : []
  if (evidence.length === 0) return out({ declared: current, declaredAt, reason: 'no-evidence' })

  const items = evidence.map((e) => checkEvidence(e, { now, ...probes }))
  const summary = items.map((i) => `${i.describe} — ${i.detail}`).join('; ')
  const answerable = items.filter((i) => !UNANSWERABLE_DETAILS.has(i.detail))
  const judgedOn = evidenceVerdict(items).judgedOn
  if (answerable.length === 0) {
    return out({ declared: current, declaredAt, reason: 'unanswerable', summary, items, judgedOn })
  }

  const advancing = answerable.some((i) => i.ok)
  return out({
    declared: current,
    declaredAt,
    advancing,
    reason: advancing ? 'advancing' : current ? 'no-progress' : 'expired',
    summary,
    items,
    judgedOn,
  })
}

/** How the reported evidence kind reads in a sentence. */
const JUDGED_ON_WORDS = {
  git: 'the work’s own git output',
  process: 'a live process (no git output)',
  log: 'a log file only — the weakest evidence there is',
  none: 'nothing that still checks out',
}

/** The one line the guard puts in the boundary log and in its allow message.
 *  It NAMES the evidence the verdict rests on (point 434 (5)): the 30.07 mistake
 *  was invisible because the verdict never said which source had answered. */
export function describeInFlight(assessment, declaration) {
  const what = declaration?.waitingOn ? String(declaration.waitingOn) : 'in-flight work'
  const mins = Number.isFinite(assessment?.ageMs) ? Math.round(assessment.ageMs / 60000) : null
  const age = mins === null ? '' : ` (declared ${mins} min ago)`
  const on = JUDGED_ON_WORDS[assessment?.judgedOn] ?? JUDGED_ON_WORDS.none
  const ignored =
    Array.isArray(assessment?.ignored) && assessment.ignored.length > 0
      ? ` [silent but NOT counted as dead: ${assessment.ignored.join('; ')}]`
      : ''
  return `${what}${age}: ${assessment?.summary || 'no evidence'} — judged on ${on}${ignored}`
}
