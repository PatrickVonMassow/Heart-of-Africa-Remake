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
import { parseGateLine, sanitiseReason } from './user-gate-core.mjs'
import { SECTION_TITLES, sliceSections, parseCards, etaStatus } from './dashboard-guard-core.mjs'
import { NOW_CARD_CMD, REPUBLISH } from './board-remedy.mjs'

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
 * The launcher's question is not the guard's. The GUARD asks "may a turn end ride
 * on this declaration?", where an aged one must stop counting — that is what
 * `IN_FLIGHT_MAX_AGE_MS` (45 min) is for. The LAUNCHER asks "what was this owner
 * waiting on?", and for that age is a poor disqualifier: a declaration does not
 * become false by growing old, it becomes false when the session went on working
 * after making it. So the launcher gets its own, far wider window.
 *
 * WHAT THIS CONSTANT NO LONGER DOES (point 434, 30.07.2026). It used to feed a
 * VERDICT: `assessOwner` turned a declaration that had stopped moving into
 * `work-stalled` past `WORK_STALL_MS`, gated by a `lastWord` tolerance — and the
 * three constants involved were so hard to satisfy at once that the verdict was
 * unreachable in production while its tests stayed green. All three are gone with
 * the wedge ladder; liveness is now the LEASE, pure arithmetic on the lock, and
 * nothing about a declaration extends ownership any more (a wait that needs longer
 * says so in advance via `extendLease`).
 *
 * WHAT IT STILL DOES, and why it is still four hours: it bounds how long a
 * declaration stays readable AS a declaration, which is what the launcher REPORTS
 * from when it takes an expired lease — "it was waiting on the agent for point N"
 * rather than a bare takeover line. Four hours because a report is cheap and a
 * wrong one is not: past that the declaration has nothing useful left to say. It
 * stays WRITTEN OUT rather than borrowed from another constant (point 433's
 * lesson): it once read `= WEDGED_MS`, and when that dropped from four hours to 45
 * minutes this window would have collapsed with it — silently, for a reason that
 * had nothing to do with reporting.
 */
export const LAUNCHER_WORK_MAX_AGE_MS = 4 * 60 * 60 * 1000

/**
 * MAY A DECLARATION STILL SHIELD SOMETHING FROM A SWEEP? PURE (point 437 G).
 *
 * The branch sweep read the in-flight file RAW — every branch and worktree it
 * named was exempt, with no age and no liveness asked — while the expiry lived
 * in a consumer the sweep never called. A dead session's declaration therefore
 * shielded its branch and its worktree from the sweep FOR EVER, which is the one
 * thing the sweep exists to prevent.
 *
 * This is the cheap half of `assessInFlight`: the same `at` field and the same
 * `IN_FLIGHT_MAX_AGE_MS`, without the evidence probes. That is the right depth
 * HERE and nowhere else — a branch whose work is genuinely still moving is
 * already protected by the sweep's own grace window on its tip date, so this
 * only has to stop a declaration that has simply been left behind. The costlier
 * output probing stays where a WAIT is judged, because there a false "dead"
 * kills a running agent, while here it costs one turn.
 *
 * Returns { shields, reason, ageMs }. Anything unreadable SHIELDS: a declaration
 * this cannot parse is not evidence that the work is over.
 */
export function declarationShields({ declaration, now = Date.now(), maxAgeMs = IN_FLIGHT_MAX_AGE_MS } = {}) {
  if (!declaration || typeof declaration !== 'object') return { shields: true, reason: 'unreadable', ageMs: null }
  const at = Number(declaration.at)
  if (!Number.isFinite(at)) return { shields: true, reason: 'no-timestamp', ageMs: null }
  const ageMs = Number(now) - at
  // A stamp from the future is a clock nothing here can reason about — shield,
  // and let the wait-side assessment, which blocks on skew, be the strict one.
  if (!(ageMs >= 0)) return { shields: true, reason: 'clock-skew', ageMs }
  if (ageMs > maxAgeMs) return { shields: false, reason: 'expired', ageMs }
  return { shields: true, reason: 'live', ageMs }
}

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
 *
 * THE CAVEAT THAT WAS NAMED HERE IS NOW ANSWERED (point 434 (5b), 30.07.2026).
 * `worktreeActiveAt` used to stat exactly four GIT paths — the gitdir, `index`,
 * `HEAD`, `COMMIT_EDITMSG` — so what it dated was the last git OPERATION, not the
 * last edit, and it failed in both directions: an agent writing source files for
 * twenty minutes without running a git command read as `quiet` (measured live: the
 * same worktree said "quiet for 21 min" while its agent was mid-edit), while a
 * supervisor's own `git status` on that worktree refreshed the index and made the
 * observer's look the evidence. It now also dates the newest WORKING FILE, and the
 * verdict says WHICH of the two it read (`combineWorktreeStamps`). A reader cannot
 * fake that half: looking at a checkout does not rewrite the files in it.
 */
export const OUTPUT_KINDS = new Set(['branch', 'worktree'])

/** How a worktree stamp names where it came from. Both are asked; the NEWEST of
 *  the two carries the verdict, and its name goes into the detail string. */
export const WORKTREE_SOURCE = { files: 'working files', git: 'git metadata' }

/**
 * THE NEWEST OF THE TWO WORKTREE STAMPS, AND WHICH ONE IT WAS. PURE.
 *
 * `gitAt` is the git metadata's mtime, `filesAt` the newest working-file mtime.
 * Returns { at, source } — or null when neither could be read, which keeps the
 * `worktree-gone` path exactly as it was. A tie goes to the working files: they
 * are the half a reader cannot contaminate.
 */
export function combineWorktreeStamps({ gitAt = null, filesAt = null } = {}) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const g = num(gitAt)
  const f = num(filesAt)
  if (g === null && f === null) return null
  if (f !== null && (g === null || f >= g)) return { at: f, source: WORKTREE_SOURCE.files }
  return { at: g, source: WORKTREE_SOURCE.git }
}

/**
 * NORMALISE WHAT A WORKTREE PROBE ANSWERED. PURE.
 *
 * The probe may answer `{ at, source }` (the current shape) or a bare epoch ms
 * (what every caller used to pass, and what a test injecting a plain number still
 * passes). Both are read; an unusable value answers null. A bare number carries no
 * source, so nothing is invented for it — the detail simply names none.
 */
export function worktreeStamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return { at: value, source: null }
  if (value && typeof value === 'object' && typeof value.at === 'number' && Number.isFinite(value.at)) {
    return { at: value.at, source: typeof value.source === 'string' && value.source ? value.source : null }
  }
  return null
}

/**
 * THE PATHS `git status --porcelain -z` NAMED. PURE.
 *
 * NUL-separated so no path is ever quoted or escaped (a `"` in the plain
 * `--porcelain` output would otherwise have to be unescaped by hand). Each record
 * is `XY <path>`; a rename/copy record is followed by a SECOND chunk holding the
 * source path, which is skipped — it is the path the file no longer has.
 *
 * `limit` bounds the work: a checkout with thousands of dirty paths must not turn a
 * liveness probe into a tree walk. `git status` sorts by PATH, not by mtime, so a
 * checkout dirtier than the limit can miss the newest file — the caller then falls
 * back to the git metadata, which can only UNDER-report freshness, never invent it.
 *
 * The path is taken verbatim: `-z` exists precisely so nothing is quoted or
 * escaped, and trimming it would corrupt the (legal) path that begins or ends with
 * a space (four-eyes review, finding 6).
 */
export function porcelainPaths(out, { limit = 400 } = {}) {
  const chunks = String(out ?? '').split('\0')
  const paths = []
  for (let i = 0; i < chunks.length && paths.length < limit; i += 1) {
    const chunk = chunks[i]
    if (!chunk || chunk.length < 4) continue
    const xy = chunk.slice(0, 2)
    const path = chunk.slice(3)
    if (path) paths.push(path)
    if (xy.includes('R') || xy.includes('C')) i += 1 // the rename/copy source chunk
  }
  return paths
}

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
 *   worktreeActiveAt — (path) => { at, source }|number|null, when the worktree last
 *                      MOVED and which of its two sources said so (see
 *                      `combineWorktreeStamps`); a bare number keeps its old meaning
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
    const stamp = worktreeStamp(worktreeActiveAt ? worktreeActiveAt(path) : null)
    if (!stamp) return no(`worktree ${path}${label}`, 'worktree-gone')
    const idle = now - stamp.at
    // NAME THE EVIDENCE (point 434 (5b)): git metadata and the working files are
    // both asked, and a verdict that does not say which one answered is exactly
    // how "quiet for 21 min" hid a mid-edit agent.
    return idle <= window(workFreshMs)
      ? yes(`worktree ${path}${label}`, `active ${minutes(idle)} min ago${stamp.source ? ` (${stamp.source})` : ''}`)
      : no(`worktree ${path}${label}`, `quiet for ${minutes(idle)} min${stamp.source ? ` (newest: ${stamp.source})` : ''}`)
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
// THE DECLARATION AS A TRANSFERABLE ADOPTION RECORD (point 675, defeat 2;
// merged proposal M4/M7/M28–M34)
// ---------------------------------------------------------------------------
//
// A handover used to be allowed only when no delegated agent was in flight, so a
// session that kept the pool busy could never hand over. The condition is now
// "the point I was LANDING is landed", and a running AUTHOR is ADOPTED by the
// successor through this declaration. That only works when the declaration is
// more than a PID: it must carry identity a successor can verify (batch-less
// today, so: the work's own branch and its committed-and-pushed checkpoint,
// plus the process-start identity the pid evidence already records), it must
// stay probeable after the transfer, and it must ALERT loudly rather than
// silently unblock when its evidence expires or contradicts itself (M7). A
// worker that cannot produce a committed-and-pushed checkpoint is
// NON-TRANSFERABLE and blocks the handover with named recovery choices (M29):
// it would die, unrescued, with the session that spawned it.

/**
 * IS THE DECLARED WORK TRANSFERABLE TO A SUCCESSOR? PURE.
 *
 * `items` is one entry per piece of declared evidence, pre-annotated by the IO
 * half: { kind, describe, checkpoint } where checkpoint is
 * { ref, localSha, remoteSha } for branch/worktree kinds (null when the ref or
 * the remote-tracking ref could not be read) and null for pid/log kinds.
 *
 * The rule: every branch/worktree item needs a PUSHED checkpoint (local tip ==
 * remote-tracking tip), and at least ONE ADOPTABLE item must exist — a
 * declaration of only bare pids and logs names nothing a successor could adopt:
 * the process dies with this session and the log proves nothing about what
 * survives.
 *
 * A RUNNING VERIFICATION IS ADOPTABLE (point 700): a log item annotated with
 * its RUN RECORD (`run` — the `<log>.run.json` scripts/verify/run-logged.mjs
 * writes: suites, backends, the HEAD it covers, pid, and the receipt once it
 * closes) is a named, awaitable run, not a process that merely dies. It counts
 * as adoptable output and is recorded for the successor, which awaits the
 * receipt and reads the verdict — so a 25-minute suite never again PINS a
 * session past the watermark by demanding a drain. A log WITHOUT a record
 * still proves nothing and still counts as none.
 *
 * THE RECORD IS HELD TO THE SAME EVIDENCE BAR AS A BRANCH (Sol review of
 * d0aebb6, finding 2 — a nonempty recordPath alone proved nothing). Like a
 * checkpoint must be committed AND pushed, a run must be VERIFIABLY worth
 * inheriting: (a) it names a LIVE run (`status: running` with its pid probed
 * alive) or a receipt that ALREADY exists (`finished`/receipt written — the
 * verdict is readable now), and (b) it covers the HEAD being handed over
 * (`headNow`). A record that says `running` over a dead pid is a wrapper that
 * died unstamped — a successor would await a receipt that never arrives, the
 * exact failure this mechanism exists to prevent — and a run of another HEAD
 * verifies nothing about the state being handed over. Each failure BLOCKS by
 * name; evidence that cannot be established never counts as established.
 *
 * Returns { transferable, blockers: [{ describe, why }], checkpoints, runs }.
 */
export function assessTransfer({ items = [], headNow = null } = {}) {
  const list = Array.isArray(items) ? items : []
  const blockers = []
  const checkpoints = []
  const runs = []
  let output = 0
  // Both sides must LOOK like a sha at git's own minimum meaningful
  // abbreviation (7 — this repo's short-sha length) before either may
  // abbreviate the other (Sol review of 534c2ba): `runRecordFor` accepts
  // arbitrary non-empty head strings, and a bare prefix test let a
  // one-character recorded head "match" any HEAD that happened to start
  // with it. Shorter or non-hex is no identity, so it is no match.
  const HEX_SHA = /^[0-9a-f]{7,40}$/
  const sameHead = (a, b) => {
    const x = String(a ?? '').toLowerCase()
    const y = String(b ?? '').toLowerCase()
    if (!HEX_SHA.test(x) || !HEX_SHA.test(y)) return false
    return x.startsWith(y) || y.startsWith(x)
  }
  for (const item of list) {
    if (item?.kind === 'log' && item.run && typeof item.run.recordPath === 'string' && item.run.recordPath) {
      const run = item.run
      const describe = String(item.describe ?? 'log')
      // A RECEIPT IS A RECEIPT (Sol review of 534c2ba): only `hasReceipt` —
      // the probed existence of the receipt on the record itself — counts. A
      // self-declared `status: 'finished'` never substitutes: the whole point
      // of this bar is that the successor can READ the verdict, and a record
      // stamped finished without its receipt offers nothing to read.
      const receiptExists = run.hasReceipt === true
      const live = run.status === 'running' && run.alive === true
      if (!receiptExists && !live) {
        blockers.push({
          describe,
          why:
            run.status === 'running'
              ? 'its run record says "running" but the pid is gone or unverifiable — a successor would await a receipt that never arrives'
              : `its run record is in state "${run.status ?? 'unknown'}" with no receipt — nothing to await and nothing to read`,
        })
      } else if (!sameHead(run.head, headNow)) {
        blockers.push({
          describe,
          why:
            run.head && headNow
              ? `its run covers HEAD ${run.head}, not the ${headNow} being handed over`
              : 'the commit its run covers could not be verified against the HEAD being handed over',
        })
      } else {
        runs.push(run)
      }
      continue
    }
    if (!OUTPUT_KINDS.has(item?.kind)) continue
    output += 1
    const cp = item.checkpoint
    if (!cp || typeof cp.localSha !== 'string' || !cp.localSha) {
      blockers.push({ describe: String(item.describe ?? item.kind), why: 'no committed checkpoint could be read' })
    } else if (typeof cp.remoteSha !== 'string' || !cp.remoteSha) {
      blockers.push({ describe: String(item.describe ?? item.kind), why: `branch ${cp.ref ?? '?'} was never pushed` })
    } else if (cp.localSha !== cp.remoteSha) {
      blockers.push({
        describe: String(item.describe ?? item.kind),
        why: `branch ${cp.ref ?? '?'} has unpushed commits (local ${cp.localSha.slice(0, 8)} ≠ origin ${cp.remoteSha.slice(0, 8)})`,
      })
    } else {
      checkpoints.push({ ref: cp.ref ?? null, sha: cp.localSha })
    }
  }
  if (output === 0 && runs.length === 0 && list.length > 0) {
    blockers.push({
      describe: 'the whole declaration',
      why:
        'it names only pids/logs — nothing with a committed-and-pushed checkpoint, and no run record beside ' +
        'a log, that a successor could adopt',
    })
  }
  return { transferable: blockers.length === 0, blockers, checkpoints, runs }
}

/**
 * THE REFUSAL, with its NAMED RECOVERY CHOICES (M29). PURE, so the wording is
 * pinned by a test rather than improvised at the one moment it matters.
 */
export function transferBlockMessage({ blockers = [] } = {}) {
  const lines = blockers.map((b) => `  ${b.describe} — ${b.why}`).join('\n')
  return (
    'THE HANDOVER IS BLOCKED: declared in-flight work is NOT transferable — a successor could neither ' +
    `verify nor rescue it, so ending now would throw it away:\n${lines}\n` +
    'Recovery choices, by name:\n' +
    '  (a) CHECKPOINT — have the worker commit and PUSH its branch (a rescue commit per CLAUDE.md §6 if it ' +
    'is mid-step), then retry the boundary;\n' +
    '  (b) DRAIN — await the work in this session (`node scripts/verify/run-wait.mjs --await` for a run; let ' +
    'the agent finish), then retry;\n' +
    '  (c) RE-DECLARE — if the pid/log evidence merely rides beside a real branch, declare the branch/worktree ' +
    'too (`node scripts/batch-in-flight.mjs --waiting-on … --branch <ref> --worktree <path>`), then retry;\n' +
    '  (d) ABANDON — if the work is genuinely disposable, `node scripts/batch-in-flight.mjs --clear` and say so ' +
    'in the closing report.\n' +
    'Nothing recorded.'
  )
}

/**
 * MARK A DECLARATION TRANSFERRED at boundary commit. PURE. The original
 * evidence stays probeable (M7); the transfer block records who handed it over,
 * when, and the checkpoints the successor can verify against.
 *
 * A previous ADOPTION is DROPPED (Sol re-review of cd6faaa, finding 1): a new
 * transfer supersedes it, and a record still stamped `adopted` would lose the
 * mutation protection the moment it crossed a SECOND boundary — the very
 * record a chain of handovers depends on most.
 */
export function markTransferred({ declaration, bySid, now, checkpoints = [], runs = [] } = {}) {
  const { adopted: _superseded, ...rest } = declaration ?? {}
  return {
    ...rest,
    transfer: {
      v: 1,
      by: String(bySid ?? ''),
      at: Number(now),
      checkpoints,
      // The RUNNING VERIFICATIONS handed over (point 700): the successor awaits
      // each record's receipt rather than restarting the run. Only present when
      // one was declared, so branch-only transfers keep their shape.
      ...(Array.isArray(runs) && runs.length > 0 ? { runs } : {}),
    },
  }
}

/**
 * MAY A SUCCESSOR ADOPT THIS TRANSFERRED DECLARATION, and what must it be TOLD?
 * PURE (M4/M7).
 *
 * `items` are `checkEvidence` results for the declaration's evidence;
 * `checkpointStates` re-reads each recorded checkpoint:
 * { ref, recordedSha, localSha } (localSha null = branch gone).
 *
 * The asymmetry is deliberate: adoption DROPS evidence that no longer checks out
 * (an old session's child pid is dead by construction) but must SAY so — and it
 * REFUSES when nothing survives or a checkpoint contradicts itself (a branch
 * rewound below its recorded checkpoint is not the work that was handed over).
 * Silence is the one forbidden outcome.
 *
 * Returns { adopt, alerts, kept, dropped }.
 */
export function adoptionAssessment({ items = [], checkpointStates = [] } = {}) {
  const alerts = []
  const kept = []
  const dropped = []
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.ok === true) kept.push(item)
    else {
      dropped.push(item)
      alerts.push(`evidence expired since the transfer: ${item?.describe ?? '?'} — ${item?.detail ?? '?'}`)
    }
  }
  let contradiction = false
  for (const cp of Array.isArray(checkpointStates) ? checkpointStates : []) {
    if (!cp || typeof cp.recordedSha !== 'string') continue
    if (typeof cp.localSha !== 'string' || !cp.localSha) {
      contradiction = true
      alerts.push(`checkpoint CONTRADICTED: branch ${cp.ref ?? '?'} (recorded ${cp.recordedSha.slice(0, 8)}) is gone`)
    } else if (cp.localSha !== cp.recordedSha && cp.ancestor !== true) {
      contradiction = true
      alerts.push(
        `checkpoint CONTRADICTED: branch ${cp.ref ?? '?'} no longer carries recorded ${cp.recordedSha.slice(0, 8)} ` +
          `(now ${cp.localSha.slice(0, 8)}, not a descendant)`,
      )
    }
  }
  const adopt = !contradiction && kept.length > 0
  if (!adopt && kept.length === 0 && !contradiction) {
    alerts.push('NOTHING in the transferred declaration still checks out — there is nothing left to adopt')
  }
  return { adopt, alerts, kept, dropped }
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
 * How long a FRESH LOG may keep an agent alive whose git output could be measured
 * and has stood still (four-eyes review, Fable 5, 30.07.2026, finding 4).
 *
 * A fresh log is genuine evidence that something is happening, so it refuses the
 * respawn — but it must not refuse it FOREVER: an agent wedged in a printing loop
 * would then be unreplaceable except by hand, which is a standstill of exactly the
 * kind this point exists to end. Past this bound, measured-quiet output outranks
 * a log that has produced nothing but lines. Twice the grace, so an agent that
 * simply thinks aloud for a while is never touched.
 */
export const LOG_OVERRIDES_QUIET_GIT_MS = 2 * RESPAWN_GRACE_MS

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
  logOverrideMs = LOG_OVERRIDES_QUIET_GIT_MS,
} = {}) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  // The worktree probe answers { at, source } (point 434 (5b)) and a bare number
  // is still accepted, so a caller injecting one keeps its old meaning.
  const wt = worktreeStamp(worktreeAt)
  const git = [wt ? wt.at : null, num(branchTipAt)].filter((v) => v !== null)
  const log = num(logAt)
  const newestGit = git.length > 0 ? Math.max(...git) : null
  // Say which source the newest stamp came from where the WORKTREE is the newest
  // one and it named itself; a branch tip is already named by `commit`.
  const named = wt && wt.source && wt.at === newestGit ? wt.source : null
  if (newestGit !== null && now - newestGit <= graceMs) {
    return {
      verdict: 'alive',
      judgedOn: 'git',
      ageMs: now - newestGit,
      detail: `work output ${minutes(now - newestGit)} min old${named ? ` (${named})` : ''}`,
    }
  }
  // A FRESH log is genuine evidence that something is happening — it is only
  // SILENCE that proves nothing — but it may not outrank measured, quiet output
  // indefinitely (see `LOG_OVERRIDES_QUIET_GIT_MS`).
  const gitLongQuiet = newestGit !== null && now - newestGit > logOverrideMs
  if (log !== null && now - log <= graceMs && !gitLongQuiet) {
    return { verdict: 'alive', judgedOn: 'log', ageMs: now - log, detail: `log written ${minutes(now - log)} min ago` }
  }
  if (newestGit === null) {
    return { verdict: 'unmeasurable', judgedOn: 'none', ageMs: null, detail: 'no worktree and no branch could be read' }
  }
  return {
    verdict: 'quiet',
    judgedOn: 'git',
    ageMs: now - newestGit,
    detail: `no commit and nothing written for ${minutes(now - newestGit)} min${named ? ` (newest: ${named})` : ''}`,
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
 *
 * A point WAITING ON THE USER (point 450) is carried but FLAGGED, not dropped:
 * `independentOpenPoints` filters it out, so an idle pool slot never owes a
 * reason for work nobody may start — and the flag survives so the decision can
 * say WHY the queue held nothing, instead of reporting a file overlap that is
 * not there.
 */
export function openPointSpecs(tasksText = '') {
  const out = []
  let current = null
  for (const line of String(tasksText ?? '').split('\n')) {
    const head = line.match(/^- \[( |x)\] (\d+)\./)
    if (head) {
      if (current) out.push(current)
      current =
        head[1] === ' ' && !/\bDEFERRED\b/.test(line)
          ? { point: Number(head[2]), text: line, gated: Boolean(parseGateLine(line)?.gated) }
          : null
      continue
    }
    if (current) current.text += `\n${line}`
  }
  if (current) out.push(current)
  return out.map((p) => ({ point: p.point, files: filesNamedIn(p.text), gated: p.gated }))
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
    // Waiting on the user is not commissionable work (point 450).
    if (p?.gated) return false
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
  openBranches = 0,
  branchesReadable = true,
  recordReadable = true,
  openPoints = [],
  runningFiles = [],
  reason = '',
  paused = false,
  closingFreeze = false,
  cap = POOL_CAP,
} = {}) {
  // WHAT OCCUPIES A SLOT IS THE OPEN BRANCH (point 712), and this half counts it
  // the same way the refusal does — otherwise the two rules trap the session
  // between them: nine branches open and one agent running would have this
  // demand a fourth point while `commission-guard` refuses every one of them.
  //
  // A RUNNING AGENT WITHOUT A BRANCH STILL FILLS ITS SLOT, and that is a
  // SEPARATE, NAMED state rather than a second occupancy rule. The two must not
  // be folded into one number: `max(agents, branches)` reported two agents and
  // no branch as ONE free slot when three branch slots stand empty, and that is
  // the agent count occupying a branch slot again (Sol, reviews of 91d88f9a and
  // 3078d166). So `slotsFree` counts BRANCHES and nothing else, `agents` reports
  // the agents actually declared, and the concurrent-agent cap of CLAUDE.md §6
  // — which still binds a spawn — suppresses the demand under its OWN name:
  // asking for a fourth point while three agents run would ask for a breach of
  // it, so that state answers `agents-at-cap` and the report says which is full.
  const declared = Number.isFinite(agents) && agents > 0 ? Math.floor(agents) : 0
  const branches = Number.isFinite(openBranches) && openBranches > 0 ? Math.floor(openBranches) : 0
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : POOL_CAP
  const slotsFree = Math.max(0, limit - branches)
  const candidates = independentOpenPoints({ points: openPoints, runningFiles })
  const no = (why) => ({
    needsReason: false,
    slotsFree,
    agents: declared,
    openBranches: branches,
    candidates,
    why,
  })
  // A paused batch and a closing freeze are states in which commissioning MORE work
  // would be wrong — the freeze exists so the closing tests the final state.
  if (paused === true) return no('paused')
  if (closingFreeze === true) return no('closing-freeze')
  // OCCUPANCY NOBODY COULD READ IS NOT IDLENESS. Where git could not be
  // questioned the branch count is 0 for want of an answer, not because no
  // branch stands, and demanding work on that is the fail-CLOSED direction.
  if (branchesReadable !== true) return no('branches-unreadable')
  if (recordReadable !== true) return no('record-unreadable')
  if (branches >= limit) return no('at-cap')
  if (declared >= limit) return no('agents-at-cap')
  if (candidates.length === 0) {
    // WHY the queue offered nothing matters (point 450). "Everything left waits
    // on the user" is a different state from "everything left touches the
    // running branch", and reporting the second for the first is how a fortnight
    // of the user's absence would read as a tooling fault.
    const list = Array.isArray(openPoints) ? openPoints : []
    const gatedOnly = list.length > 0 && list.every((p) => p?.gated)
    return no(gatedOnly ? 'queue-user-gated' : 'queue-overlaps')
  }
  if (String(reason ?? '').trim()) return no('reason-given')
  return { ...no('idle-slots'), needsReason: true }
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
    `THE AGENT POOL IS BELOW ITS CAP AND NOTHING SAYS WHY: ${slots.openBranches ?? 0} open feat/* branch(es) and ` +
    `${slots.agents ?? 0} agent(s) running, ` +
    `${slots.slotsFree ?? 0} of ${cap} slots FREE, and the queue holds independent open point(s) that touch none of ` +
    `the running branch's files (${names || 'see the work order'}). The declared wait is fine; the idle slots are ` +
    'not accounted for. TWO honest answers: (a) COMMISSION another point into a free slot — a worktree-isolated ' +
    'agent on its own feat/<point>-<slug> branch, on files the running work does not touch; or (b) STATE what ' +
    'makes the queue\'s next points unsuitable right now: `node scripts/batch-in-flight.mjs --waiting-on "<what>" ' +
    '<evidence> --slots-free "<why>"` (file overlap with the running branch, a closing freeze, a user pause are ' +
    'all valid reasons). A paused batch, a recorded closing freeze and a full pool need no reason at all.'
  )
}

// ---- A SLOT IS NOT FREE UNTIL ITS BRANCH IS GONE (point 712) ---------------
//
// The cap above counts CONCURRENT AGENTS, so an agent that finishes returns its
// slot and leaves its branch standing. Branches then accumulate unbounded: nine
// stood open on 17.08.2026, the two OLDEST of them the communication mechanic
// this release exists for — `feat/336-croc-staging` 13 days old and 1679 commits
// behind `main`, indistinguishable from live work. Built work that never lands
// delivers nothing and costs more to merge every day it ages.
//
// So what OCCUPIES a slot is the open branch, not the running agent, and the
// only way to give one back is to LAND it or to PARK it on the record.

/** The refusals' recorded state: the overrides taken per point and the branches
 *  parked out of the count. Git-ignored, like the other `.claude/` state files —
 *  it describes THIS checkout's batch, not the repository's content. */
export const COMMISSION_RECORD_PATH = '.claude/commission-record.json'

/** How a branch is taken out of the count — named by the refusal itself. */
export const BRANCH_PARK_CMD = 'node scripts/commission-guard.mjs --park <branch> --reason "<why>"'

/** …and the other way out, which is the one that should normally be taken. */
export const BRANCH_LAND_CMD = 'node scripts/land-point.mjs <N> --model <m>'

/** `refs/heads/x`, `heads/x`, `origin/x` and `x` all name one branch — the
 *  spelling rule the evidence checks already use, exported so the branch-slot
 *  judgment and its record cannot drift into a second one. */
export const normaliseBranchRef = normRef

/** The point a `feat/<N>-…` branch belongs to, or null. The branch NAME is the
 *  only thing tying an open branch to a work-order point, which is exactly why
 *  the workflow prescribes that name. */
export function pointOfBranch(ref) {
  const m = /^feat\/(\d+)(?:[-/]|$)/.exec(normRef(ref))
  const n = m ? Number(m[1]) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * The ACTIVE point set the board now-section derives from: the owner's current
 * focus plus every point a structured in-flight strand names. PURE.
 *
 * The declaration is the source for handed-over parallel strands, but it is not
 * the whole source: the owner may be actively working the focused point without
 * any `batch-in-flight` declaration at all. That focused point is therefore one
 * active point in its own right, and the declaration only adds further strands.
 *
 * Only structured point identities count. A `feat/<N>-…` branch or a worktree on
 * one names point N; an explicit integer `point` field may name one too. Open
 * branches absent from the declaration add nothing, and a malformed
 * branch/worktree claim makes the result unreadable rather than quietly empty.
 */
export function activeNowPoints({ declaration = null, focusPoint = null, worktreeRef = () => null } = {}) {
  const points = []
  const problems = []
  const add = (value) => {
    const n = Number(value)
    if (Number.isInteger(n) && n > 0 && !points.includes(n)) points.push(n)
  }

  add(focusPoint)
  if (declaration == null) return { readable: true, points, problems }
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
    return { readable: false, points: [], problems: ['in-flight declaration is not a readable object'] }
  }
  if (declaration.evidence != null && !Array.isArray(declaration.evidence)) {
    return { readable: false, points: [], problems: ['in-flight declaration carries no readable evidence list'] }
  }

  for (const item of declaration.evidence ?? []) {
    if (!item || typeof item !== 'object') {
      problems.push('an in-flight evidence item is not a readable object')
      continue
    }
    const explicit = Number(item.point)
    const hasExplicit = Object.hasOwn(item, 'point')
    if (hasExplicit && !Number.isInteger(explicit)) {
      problems.push(`evidence ${item.kind ?? '?'} names an invalid point "${item.point}"`)
      continue
    }
    if (hasExplicit && explicit <= 0) {
      problems.push(`evidence ${item.kind ?? '?'} names a non-positive point "${item.point}"`)
      continue
    }
    if (hasExplicit) {
      add(explicit)
      continue
    }
    if (item.kind === 'branch') {
      const ref = String(item.ref ?? '').trim()
      const point = pointOfBranch(ref)
      if (point == null) {
        problems.push(`branch evidence "${ref || '<empty>'}" names no feat/<N> point`)
        continue
      }
      add(point)
      continue
    }
    if (item.kind === 'worktree') {
      const path = String(item.path ?? '').trim()
      const ref = path ? worktreeRef(path) : null
      const point = pointOfBranch(ref)
      if (point == null) {
        problems.push(`worktree evidence "${path || '<empty>'}" names no feat/<N> point branch`)
        continue
      }
      add(point)
    }
  }

  return { readable: problems.length === 0, points, problems }
}

/** Phases that keep a declared strand on the board until an explicit exit. */
export const ACTIVE_WORK_PHASES = Object.freeze([
  'authoring',
  'counter-read',
  'verification',
  'ready-to-land',
  'landing',
  'transferred',
  'awaiting-adoption',
  'adopted',
  'handover',
])

/** Phases whose lifecycle command has already moved the point elsewhere. */
export const TERMINAL_WORK_PHASES = Object.freeze([
  'completed',
  'landed',
  'returned',
  'decommissioned',
  'abandoned',
  'blocked-on-user',
])

/**
 * Normalize the ONE structured active-work source into the ordered point set
 * projected by the board. New evidence carries its point explicitly; legacy
 * branch/worktree evidence derives the point from the declared strand itself.
 * No undeclared `feat/*` branch is consulted, so stale branches cannot become
 * active work. The owner focus is part of the same source snapshot and leads
 * the order, so a render can put the focused strand first.
 *
 * Returns `{ ok, points, focusPoint, errors }` and never throws. An unreadable,
 * malformed, untagged, closed or checkpoint-contradictory source is UNKNOWN,
 * never the empty set. A missing declaration is a valid zero-strand record when
 * no numbered focus stands.
 */
export function normalizeActiveWork({
  readable = true,
  declaration = null,
  focusPoint = null,
  openPoints = [],
  worktreeRef = () => null,
  checkpointContradicted = false,
} = {}) {
  try {
    const errors = []
    if (readable !== true) errors.push('the active-work record is unreadable')
    if (checkpointContradicted === true) errors.push('a transferred checkpoint contradicts the recorded strand')

    const open = openPoints instanceof Set
      ? openPoints
      : new Set(Array.isArray(openPoints) ? openPoints.map(Number).filter(Number.isInteger) : [])
    const ordered = []
    const seen = new Set()
    const add = (raw, where) => {
      const point = Number(raw)
      if (!Number.isInteger(point) || point <= 0) {
        errors.push(`${where} has no valid point number`)
        return
      }
      if (open.size > 0 && !open.has(point)) {
        errors.push(`${where} names point ${point}, which is not open`)
        return
      }
      if (!seen.has(point)) {
        seen.add(point)
        ordered.push(point)
      }
    }

    const declaredFocus = focusPoint ?? declaration?.focusPoint ?? null
    if (declaredFocus != null) add(declaredFocus, 'the owner focus')
    if (declaration != null) {
      if (!declaration || typeof declaration !== 'object' || !Array.isArray(declaration.evidence)) {
        errors.push('the active-work declaration is malformed')
      } else {
        declaration.evidence.forEach((item, index) => {
          if (!item || typeof item !== 'object') {
            errors.push(`evidence item ${index + 1} is malformed`)
            return
          }
          const phase = String(item.phase ?? declaration.phase ?? 'authoring').trim().toLowerCase()
          if (TERMINAL_WORK_PHASES.includes(phase)) return
          if (!ACTIVE_WORK_PHASES.includes(phase)) {
            errors.push(`evidence item ${index + 1} has unknown phase "${phase || '<blank>'}"`)
            return
          }
          if (Object.hasOwn(item, 'point')) {
            add(item.point, `evidence item ${index + 1}`)
            return
          }
          const legacyRef = item.kind === 'branch'
            ? item.ref
            : item.kind === 'worktree'
              ? worktreeRef(item.path)
              : null
          add(pointOfBranch(legacyRef), `evidence item ${index + 1}`)
        })
      }
    }

    return { ok: errors.length === 0, points: errors.length ? [] : ordered, focusPoint: Number(declaredFocus) || null, errors }
  } catch (error) {
    return { ok: false, points: [], focusPoint: null, errors: [`active-work normalization failed: ${error?.message ?? error}`] }
  }
}

/** Shell quoting stripped off a captured branch name: `git switch -c
 *  'feat/712-work'` reaches the `(\S+)` capture WITH its quotes, and a name the
 *  normaliser cannot read walks past both refusals (fourth review, finding 2).
 *  Git itself forbids quotes in a refname, so nothing legitimate is lost. */
const unquote = (name) => String(name ?? '').replace(/^['"]+/, '').replace(/['"]+$/, '')

/** Every `feat/<N>` a text names, in order. `feat/712`, `feat/712-slug` and
 *  `feat/712/x` are one branch name each — the separator is NOT required, or a
 *  slugless branch would open work unseen. */
const featPointsIn = (text) => [...String(text).matchAll(/feat\/(\d+)/gi)].map((m) => Number(m[1]))

/** Negation words that make a prose sentence unsafe to interpret as an
 * assignment, in both languages. */
const NEGATION_RE =
  /\b(?:not|never|don'?t|doesn'?t|won'?t|avoid|except|without|excluding|nicht|niemals|kein(?:e[nmrs]?)?|ohne|außer|ausser)\b/i

/**
 * THE SENTENCE A PROSE MENTION LIVES IN. This is no longer used to decide that a
 * point IS or IS NOT commissioned: five rounds demonstrated that free-prose
 * scope cannot be made reliable by widening or narrowing a regex window. It is
 * only an ambiguity detector. An uncertain call is reported visibly and binds
 * neither refusal.
 */
function mentionSentence(text, index) {
  const s = String(text)
  let start = -1
  for (const boundary of ['.', ';', ':', '!', '?', '\n']) {
    const i = s.lastIndexOf(boundary, index - 1)
    if (i > start) start = i
  }
  let end = s.length
  for (const boundary of ['.', ';', ':', '!', '?', '\n']) {
    const i = s.indexOf(boundary, index)
    if (i >= 0 && i < end) end = i
  }
  return s.slice(start + 1, end)
}

/**
 * DOES THIS STANDING BRANCH ANSWER TO THE NAME A CALL GAVE? PURE.
 *
 * A name from a cut FLAG is exact: `git branch feat/687` past a standing
 * `feat/687-bank-game` creates a second branch, and calling that a match is the
 * bypass itself. A name from PROSE is a description, and a prompt saying
 * "point 687, branch feat/687" means the branch that exists — so there, and only
 * there, a name the standing branch EXTENDS at a segment boundary counts.
 * `feat/687-b` still does not answer for `feat/687-bank-game`: the boundary is a
 * separator, not any character.
 */
export function branchAnswersTo(named, standing, { loose = false } = {}) {
  const a = normRef(named)
  const b = normRef(standing)
  if (!a || !b) return false
  if (a === b) return true
  return loose === true && (b.startsWith(`${a}-`) || b.startsWith(`${a}/`))
}

/** EVERY spelling that CUTS a branch, each capturing the name it creates. The
 *  name is read off the FLAG rather than off the whole command, so
 *  `git checkout -b feat/712-x origin/feat/705-y` opens 712 and not the branch
 *  it started FROM. `git branch -D …` is excluded by the `(?!-)`.
 *
 *  THE LONG FORMS ARE HERE BECAUSE THE SHORT ONES ALONE WERE A BYPASS (Sol,
 *  review of 3078d166): `git switch --create feat/697-x` cut a branch the guard
 *  answered `none` to, and the guard then exited before either refusal. A
 *  spelling git accepts is a spelling this rule must read. */
const CUT_PATTERNS = [
  // checkout -b / -B <name>
  /\bcheckout\b.*?\s-[bB](?:\s+|=)(\S+)/,
  // switch -c / -C / --create / --force-create <name>
  /\bswitch\b.*?\s(?:-[cC]|--create|--force-create)(?:\s+|=)(\S+)/,
  // checkout/switch --orphan <name> — an empty history is still a new branch
  /\b(?:checkout|switch)\b.*?\s--orphan(?:\s+|=)(\S+)/,
]

/** Git's GLOBAL options, which may stand between `git` and its subcommand.
 *  `git -C . branch feat/697-x` cuts a branch, and an expression anchored on
 *  `git\s+branch` read none of it (Sol, review of dd7fd78c). */
const GIT_GLOBAL =
  String.raw`(?:-[cC]\s+\S+|--git-dir(?:=\S+|\s+\S+)|--work-tree(?:=\S+|\s+\S+)|--namespace(?:=\S+|\s+\S+)` +
  String.raw`|--exec-path(?:=\S+)?|--config-env\s+\S+|--no-pager|--paginate|-p|-P|--bare|--literal-pathspecs` +
  String.raw`|--no-replace-objects|--no-optional-locks|--noglob-pathspecs|--glob-pathspecs|--icase-pathspecs)`

const GIT_BRANCH_RE = new RegExp(String.raw`\bgit(?:\s+${GIT_GLOBAL})*\s+branch\b(.*)$`, 'i')

/** `git branch` modes that LIST, DELETE or RECONFIGURE — none of them creates.
 *  `-t` is NOT here: `git branch -t feat/712-x main` sets tracking while
 *  CREATING, so reading it as not-creating was a bypass (fourth review,
 *  finding 3; its long form `--track` was already read as a plain flag). */
const BRANCH_NOT_CREATING =
  /^(?:-[dDlarvuh]|--delete|--list|--all|--remotes|--verbose|--contains|--no-contains|--merged|--no-merged|--points-at|--sort|--format|--column|--no-column|--show-current|--edit-description|--set-upstream|--set-upstream-to|--unset-upstream|--help|--color|--no-color|--abbrev|--no-abbrev|--ignore-case|--omit-empty)(?:=|$)/

/** …and the ones that CREATE by copying or renaming, where the new name is LAST. */
const BRANCH_COPY_OR_MOVE = /^(?:-[cCmM]|--copy|--move)$/

/** Flags of `git branch` whose VALUE is the next token, so it is not a name.
 *  `--recurse-submodules` is BOOLEAN (its mode travels only via `=`), so listing
 *  it here consumed the branch-name token and the creation went unread (fourth
 *  review, finding 3). */
const BRANCH_VALUE_FLAGS = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort',
  '--format', '--set-upstream-to', '-u', '--abbrev', '--color'])

/**
 * The branch a `git branch …` segment CREATES, or [] where it creates none.
 * READ AS TOKENS, not as one expression: `git branch --track feat/697-x main`
 * creates a branch behind a flag no `(?!-)` could see past, and enumerating the
 * flags that may PRECEDE a name is how a spelling escapes. So the option tokens
 * are skipped and the first plain name is taken — the last one for a copy or a
 * rename, whose earlier name is the SOURCE.
 */
function gitBranchCreates(seg) {
  const m = GIT_BRANCH_RE.exec(seg)
  if (!m) return []
  const names = []
  let copyOrMove = false
  const tokens = m[1].trim().split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '--') continue
    if (t.startsWith('-')) {
      if (BRANCH_NOT_CREATING.test(t)) return []
      if (BRANCH_COPY_OR_MOVE.test(t)) copyOrMove = true
      if (BRANCH_VALUE_FLAGS.has(t)) i += 1
      continue
    }
    names.push(unquote(t))
  }
  if (!names.length) return []
  return [copyOrMove ? names[names.length - 1] : names[0]]
}

/** ONE shell segment, judged on its own. Returns { points, refs, how }, where
 *  `refs` are the branch names the segment CREATES — read off a cut flag, so
 *  each one is a name git would bring into being, never a name merely mentioned. */
function segmentTarget(seg) {
  const none = { points: [], refs: [], how: 'none' }
  const uniq = (nums) => [...new Set(nums.filter((n) => Number.isInteger(n) && n > 0))]
  // An authoring run IS the commissioning of a point, whichever vendor runs it —
  // unless it is one of the read-only legs, which produce no work at all.
  if (!/--routing\b|--dry-run\b/.test(seg)) {
    const authored = uniq([...seg.matchAll(/author-sol\.mjs.*?--point\s+(\d+)/gi)].map((m) => Number(m[1])))
    if (authored.length) return { points: authored, refs: [], how: 'author' }
  }
  if (/\bworktree\s+add\b/.test(seg)) {
    // `-b`/`-B` names the branch a new tree cuts; without it the tree is created
    // ON a branch that is named plainly, and creating the tree is still the act.
    // `--orphan` is deliberately NOT read for a name: `git worktree add --orphan
    // <path>` derives the branch from the path, so the token after it may be
    // either — the plain `feat/<N>` scan below is the honest reading there.
    const m = /\bworktree\s+add\b.*?\s-[bB](?:\s+|=)(\S+)/.exec(seg)
    const created = uniq(m ? [pointOfBranch(unquote(m[1]))] : featPointsIn(seg))
    if (!created.length) return none
    return { points: created, refs: m ? [normRef(unquote(m[1]))] : [], how: 'worktree' }
  }
  const names = [...CUT_PATTERNS.map((re) => re.exec(seg)).map((m) => (m ? unquote(m[1]) : '')), ...gitBranchCreates(seg)]
    .map((r) => normRef(r))
    .filter((r) => pointOfBranch(r) !== null)
  const cut = uniq(names.map(pointOfBranch))
  return cut.length ? { points: cut, refs: [...new Set(names)], how: 'branch' } : none
}

/**
 * WHICH POINTS IS THIS TOOL CALL OPENING WORK ON? PURE.
 *
 * Returns { points, point, refs, how }: `points` is EVERY point the call opens,
 * `point` the first of them (the single-target shorthand the CLI and the report
 * use), `refs` the branch names the call CREATES where a cut flag names them, and
 * `how` names the act recognised for it — `agent` for a spawn, `branch` for a
 * `feat/<N>-…` being CUT, `worktree` for a tree created on one, `author` for an
 * authoring run — with `none` where the call opens nothing this rule knows about.
 *
 * `refs` is what separates FINISHING from opening a SECOND branch for one point
 * (Sol, review of 3078d166): the point alone said "687 is already in flight", so
 * `git branch feat/687-b` past a standing `feat/687-a` walked through a full
 * pool. A ref is collected only where a FLAG creates it, never from prose — a
 * spawn prompt naming `feat/697-goat` is identifying the branch it works on.
 *
 * A CALL THAT OPENS TWO POINTS OPENS BOTH, and every one of them is judged. The
 * first cut of this rule answered NULL to any second number, which made
 * `git checkout -b feat/697-a && git branch feat/705-b` — one shell call — a
 * complete bypass of both refusals (Sol, review of 91d88f9a). A COMMAND is not
 * ambiguous about what it creates: it is read SEGMENT BY SEGMENT (`&&`, `||`,
 * `;`, `|`, newline), each judged on the branch its own flag names, so a push or
 * a checkout standing beside a cut contributes nothing.
 *
 * PROSE IS CONSERVATIVE AND DECLARED. One point named without a negation in its
 * sentence is an unambiguous agent assignment. Two distinct points, or a point
 * whose sentence also contains a negation, are NOT guessed into either a
 * commissioning or an exclusion: the return value carries `ambiguous`, and the
 * hook says what it saw while binding neither refusal. Thus "697 depends on
 * 705", "implement 712 and 713", and "do not touch feat/705 but implement
 * feat/712" can no longer silently commission both or silently bypass both.
 * Switching to an existing branch, pushing one, landing one — none of them
 * CREATES anything, and none is recognised here.
 *
 * A READ-ONLY RUN OPENS NOTHING either: `author-sol.mjs --routing` answers which
 * lane owns a point and `--dry-run` prints the prompt it would send. Refusing
 * those would deny the very question a session asks BEFORE it commissions.
 */
export function commissionTarget({ toolName = '', command = '', prompt = '', description = '' } = {}) {
  const none = { point: null, points: [], refs: [], refsLoose: false, how: 'none' }
  const uniq = (nums) => [...new Set(nums.filter((n) => Number.isInteger(n) && n > 0))]
  // `refsLoose` says whether the names were CREATED by a flag (exact) or merely
  // SPOKEN in a prompt (a description, which the standing branch may extend).
  const found = (points, how, refs = []) =>
    points.length ? { point: points[0], points, refs, refsLoose: how === 'agent', how } : none
  const tool = String(toolName ?? '')
  if (tool === 'Agent' || tool === 'Task') {
    const text = `${prompt ?? ''}\n${description ?? ''}`
    const branchMatches = [...text.matchAll(/\bfeat\/(\d+)[A-Za-z0-9._\-/]*/gi)]
    const pointMatches = [...text.matchAll(/\b(?:point|punkt)\s+(\d+)\b/gi)]
    const mentioned = uniq([
      ...branchMatches.map((m) => Number(m[1])),
      ...pointMatches.map((m) => Number(m[1])),
    ])
    const mentionedRefs = [
      ...new Set(
        branchMatches
          .map((m) => normRef(m[0].replace(/[.\-/]+$/, '')))
          .filter(Boolean),
      ),
    ]
    const negatedSentence = [...branchMatches, ...pointMatches].some((m) =>
      NEGATION_RE.test(mentionSentence(text, m.index)),
    )
    if (mentioned.length > 1 || negatedSentence) {
      return {
        ...none,
        refsLoose: true,
        how: 'ambiguous-prose',
        ambiguous: {
          points: mentioned,
          refs: mentionedRefs,
          reasons: [
            ...(mentioned.length > 1 ? ['multiple point mentions'] : []),
            ...(negatedSentence ? ['negation shares a sentence with a point mention'] : []),
          ],
        },
      }
    }
    const byBranch = uniq(branchMatches.map((m) => Number(m[1])))
    // THE PROSE NAMES ITS BRANCHES TOO (Sol, review of dd7fd78c). Dropping them
    // left the spawn path on the point-wide exemption, so "point 687 on branch
    // feat/687-b" walked past a standing feat/687-a at a full pool — the very
    // escape the ref narrowing had just closed on the shell path. They are
    // matched LOOSELY, because prose describes rather than creates — and a
    // branch a clause names only to FORBID is no branch to be worked.
    if (byBranch.length) {
      return found(byBranch, 'agent', mentionedRefs)
    }
    return mentioned.length ? found(mentioned, 'agent') : none
  }
  const cmd = String(command ?? '')
  if (!cmd.trim()) return none
  const points = []
  const refs = []
  let how = 'none'
  for (const raw of cmd.split(/\n|&&|\|\||[;|&]/)) {
    const seg = raw.trim()
    if (!seg) continue
    const t = segmentTarget(seg)
    for (const n of t.points) {
      if (points.includes(n)) continue
      points.push(n)
      if (how === 'none') how = t.how
    }
    for (const r of t.refs) if (r && !refs.includes(r)) refs.push(r)
  }
  return found(points, how, refs)
}

/** An age a human reads at a glance: days past a day, hours past an hour. */
export function describeBranchAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'age unknown'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.round(ms / 3600000)
  return h < 24 ? `${h} h` : `${Math.round(ms / 86400000)} d`
}

/**
 * The record, from the file's text. PURE, and hostile-tolerant: it is
 * hand-editable, and a torn one must degrade to "nothing recorded" rather than
 * throw inside a hook. `torn` is carried so the CLI can SAY so — a silently
 * empty record would look exactly like a clean one.
 */
export function parseCommissionRecord(text) {
  const empty = { overrides: {}, parked: {}, torn: false }
  if (text === null || text === undefined || String(text).trim() === '') return empty
  let parsed
  try {
    parsed = JSON.parse(String(text))
  } catch {
    return { ...empty, torn: true }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...empty, torn: true }
  const out = { overrides: {}, parked: {}, torn: false }
  const entry = (v) => ({ reason: sanitiseReason(v?.reason), at: typeof v?.at === 'string' ? v.at : '' })
  const src = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
  for (const [key, value] of Object.entries(src(parsed.overrides))) {
    const n = Number(key)
    const e = entry(value)
    if (Number.isInteger(n) && n > 0 && e.reason) out.overrides[n] = e
  }
  for (const [key, value] of Object.entries(src(parsed.parked))) {
    const ref = normRef(key)
    // A park also carries the branch TIP it was taken at — a commit sha or
    // nothing. Anything else is a hand-edit nobody can compare against.
    const e = { ...entry(value), tip: normaliseTip(value?.tip) }
    if (ref && e.reason) out.parked[ref] = e
  }
  return out
}

/** The override recorded for a point, or '' — the string `commissionDecision`
 *  takes. The record is the ONE place a reason is kept; the queue core never
 *  reads a file. */
export function commissionOverrideFor(record, point) {
  const n = Number(point)
  return (Number.isInteger(n) ? record?.overrides?.[n]?.reason : '') || ''
}

/** Record an override for a point. Returns a NEW record; an empty reason changes
 *  nothing, because silence is the one thing this mechanism forbids. */
export function recordCommissionOverride(record, point, reason, { at = '' } = {}) {
  const base = record && typeof record === 'object' ? record : { overrides: {}, parked: {} }
  const n = Number(point)
  const text = sanitiseReason(reason)
  if (!Number.isInteger(n) || n <= 0 || !text) return base
  return { ...base, overrides: { ...base.overrides, [n]: { reason: text, at: String(at ?? '') } } }
}

/** A commit sha as the record keeps it, or '' for anything that is not one. */
export function normaliseTip(tip) {
  const text = String(tip ?? '').trim()
  return /^[0-9a-f]{7,64}$/i.test(text) ? text.toLowerCase() : ''
}

/**
 * Park a branch out of the slot count, with its reason, the moment it was taken
 * and THE TIP IT STOOD AT — the tip is what lets a parked branch come back the
 * moment it moves, and it is the only baseline that cannot be fooled.
 *
 * The timestamp alone could be, in three ways Sol named in the review of
 * 91d88f9a: git reports a committer date in whole SECONDS while the park is
 * stamped in milliseconds, so a commit made later in the same second reads as
 * older; a rebase or a `--date` preserves a committer date the branch has long
 * moved past; and an unparsable stamp made the branch parked forever. A sha
 * comparison has none of those failure modes.
 */
export function recordParkedBranch(record, ref, reason, { at = '', tip = '' } = {}) {
  const base = record && typeof record === 'object' ? record : { overrides: {}, parked: {} }
  const name = normRef(ref)
  const text = sanitiseReason(reason)
  if (!name || !text) return base
  return { ...base, parked: { ...base.parked, [name]: { reason: text, at: String(at ?? ''), tip: normaliseTip(tip) } } }
}

/** Take a branch back into the count deliberately. */
export function clearParkedBranch(record, ref) {
  const base = record && typeof record === 'object' ? record : { overrides: {}, parked: {} }
  const name = normRef(ref)
  if (!name || !base.parked?.[name]) return base
  const parked = { ...base.parked }
  delete parked[name]
  return { ...base, parked }
}

/** What the reporting command prints, so an override is visible AFTERWARDS and
 *  not only in the moment it is taken. PURE — the wording is pinned by a test. */
export function commissionRecordReport(record) {
  const lines = []
  if (record?.torn) lines.push(`${COMMISSION_RECORD_PATH} does not parse — nothing recorded can be read from it.`)
  const overrides = Object.entries(record?.overrides ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))
  const parked = Object.entries(record?.parked ?? {}).sort((a, b) => a[0].localeCompare(b[0]))
  lines.push(overrides.length ? 'Recorded queue overrides:' : 'Recorded queue overrides: none.')
  for (const [n, e] of overrides) lines.push(`  · point ${n} — ${e.reason}${e.at ? ` (${e.at})` : ''}`)
  lines.push(parked.length ? 'Parked branches (out of the slot count):' : 'Parked branches: none.')
  for (const [ref, e] of parked) {
    // A park with no baseline can never expire, so it is not honoured — and the
    // reader is told here rather than left wondering why the branch still counts.
    const baseline = e.tip
      ? ` — parked at ${String(e.tip).slice(0, 8)}`
      : Number.isFinite(Date.parse(String(e.at ?? '')))
        ? ''
        : ' — NO BASELINE, so it does NOT count as parked; park it again'
    lines.push(`  · ${ref} — ${e.reason}${e.at ? ` (${e.at})` : ''}${baseline}`)
  }
  return lines.join('\n')
}

/**
 * WHICH OPEN BRANCHES OCCUPY A SLOT? PURE.
 *
 * `branches` is [{ ref, tipAt, behind }] — every `feat/*` branch not contained in
 * `main`, as the wrapper reads them from git. Local and remote spellings of one
 * branch are ONE branch; two branches for one point are TWO (687 had exactly
 * that on 17.08.2026, and both were real work standing open).
 *
 * A PARKED BRANCH THAT MOVES IS LIVE AGAIN. The park records the TIP the branch
 * stood at, so a commit landing on it afterwards puts it straight back into the
 * count — otherwise parking would be a permanent exemption bought once, which is
 * the silent-override failure this point exists to end. A branch whose tip
 * cannot be read stays parked: an unreadable tip proves no movement.
 *
 * A park with NO baseline at all — no tip, and no timestamp that parses — is not
 * honoured: it could never expire, and a park that can never expire is the
 * permanent exemption again, bought by a typo. It is reported in `invalidParks`
 * so the reader is told rather than left wondering why the branch still counts.
 * The timestamp remains the FALLBACK baseline for parks written before the tip
 * was recorded, and it is read a whole second coarse, because git's committer
 * date is: only a tip in a strictly later second counts as movement, so a park
 * is never undone by the rounding of the very commit it was taken on.
 *
 * `exclude` is the point (or the POINTS — one shell call can open two) being
 * commissioned. Their own branches are not slots the commissioning would consume
 * — re-cutting or pushing an existing branch is finishing, not opening.
 *
 * `excludeRefs` NARROWS that to the branch actually named, where the call names
 * one. A point-wide exemption let a SECOND branch for a point in flight walk
 * through a full pool (Sol, review of 3078d166): with `feat/687-a` standing,
 * `git branch feat/687-b` was excused by its own point. So where the call names
 * the ref it creates, only THAT ref is exempt, and the point's other branches go
 * on holding their slots; where no ref is named — a spawn, a prose target — the
 * point-wide exemption stands, because the branch cannot be identified.
 */
export function openBranchSlots({
  branches = [],
  parked = {},
  exclude = null,
  excludeRefs = null,
  looseRefs = false,
  cap = POOL_CAP,
  now = Date.now(),
} = {}) {
  const parkedAt = new Map()
  for (const [ref, e] of Object.entries(parked && typeof parked === 'object' ? parked : {})) {
    parkedAt.set(normRef(ref), {
      reason: e?.reason ?? '',
      at: Date.parse(String(e?.at ?? '')),
      tip: normaliseTip(e?.tip),
    })
  }
  const skipRefs = (Array.isArray(excludeRefs) ? excludeRefs : excludeRefs ? [excludeRefs] : [])
    .map(normRef)
    .filter(Boolean)
  // A point whose OWN ref the call named is exempt for that ref alone.
  const namedPoints = new Set(skipRefs.map(pointOfBranch).filter((n) => n !== null))
  const skip = new Set(
    (Array.isArray(exclude) ? exclude : [exclude])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0 && !namedPoints.has(n)),
  )
  const seen = new Map()
  const parkedOut = []
  const invalidParks = []
  for (const b of Array.isArray(branches) ? branches : []) {
    const ref = normRef(b?.ref)
    if (!ref || seen.has(ref)) continue
    const tipAt = Number.isFinite(b?.tipAt) ? b.tipAt : null
    const tip = normaliseTip(b?.tip)
    const item = {
      ref,
      point: pointOfBranch(ref),
      tipAt,
      tip,
      ageMs: tipAt === null || !Number.isFinite(now) ? null : Math.max(0, now - tipAt),
      behind: Number.isFinite(b?.behind) ? b.behind : null,
    }
    const park = parkedAt.get(ref)
    if (park && !parkHolds(park)) invalidParks.push({ ...item, reason: park.reason })
    else if (park && !movedSincePark(park, item)) {
      // A park whose CURRENT tip could not be read stays parked (see
      // `movedSincePark`), but it is MARKED, so the reporting side can say the
      // baseline could not be checked instead of passing it off as verified.
      parkedOut.push({ ...item, reason: park.reason, ...(park.tip && !item.tip ? { tipUnverified: true } : {}) })
      seen.set(ref, true)
      continue
    }
    if (skipRefs.some((r) => branchAnswersTo(r, ref, { loose: looseRefs })) || (item.point !== null && skip.has(item.point))) {
      seen.set(ref, true)
      continue
    }
    seen.set(ref, item)
  }
  const open = [...seen.values()]
    .filter((v) => v !== true)
    // Oldest first: the branch that has been standing longest is the one to land.
    .sort((a, b) => (a.tipAt ?? Infinity) - (b.tipAt ?? Infinity) || a.ref.localeCompare(b.ref))
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : POOL_CAP
  return {
    open,
    parkedOut,
    invalidParks,
    count: open.length,
    slotsFree: Math.max(0, limit - open.length),
    cap: limit,
  }
}

/** Does this park have a baseline movement can be measured against at all? */
function parkHolds(park) {
  return Boolean(park?.tip) || Number.isFinite(park?.at)
}

/** Has the branch moved since it was parked? The TIP decides where one was
 *  recorded; the timestamp is the coarse fallback for a park written without.
 *
 *  AN UNREADABLE CURRENT TIP READS AS UNMOVED — DELIBERATELY (fourth review,
 *  finding 5, kept on the spec's fail-open rule). The strict reading would put
 *  the branch back into the count exactly when git could not be asked, i.e. it
 *  would REFUSE commissioning on the guard's own failure — the fail-closed
 *  direction every leg here avoids. The cost is bounded: the branch stays
 *  parked, which is the state a human explicitly recorded, and the blindness
 *  is not silent — `openBranchSlots` marks the entry `tipUnverified` and the
 *  status report names it. The timestamp fallback below still honours tipless
 *  parks (written before the tip was recorded; `--park` always records one
 *  now) and cannot see a rebase or a backdated commit — recorded residual,
 *  same fail-open reasoning, visible in the record report as the missing
 *  "parked at <sha>" baseline. */
function movedSincePark(park, item) {
  if (park?.tip) return Boolean(item.tip) && item.tip !== park.tip
  if (!Number.isFinite(park?.at) || item.tipAt === null) return false
  // Git's committer date is whole seconds, the park stamp is milliseconds: only a
  // tip in a strictly LATER second is evidence of a commit after the park.
  return item.tipAt >= Math.floor(park.at / 1000) * 1000 + 1000
}

/**
 * MAY A FURTHER POINT BE OPENED, GIVEN THE BRANCHES THAT STAND? PURE.
 *
 * Returns { allowed, why, open, parkedOut, count, slotsFree, cap, adding,
 * reopens }. `reopens` names the PARKED branches this call assigns work back
 * onto — each one reoccupies its slot at the assignment, and the wrapper clears
 * its park the moment the call is allowed (finding 6). `readable`
 * false is the fail-open case the wrapper passes when git could not be
 * questioned: a branch list nobody could read is not evidence of debris.
 *
 * There is deliberately NO reason-override here. The first refusal's escape is a
 * recorded reason because the queue's order can legitimately be departed from;
 * this one's escapes are LAND and PARK, both of which change the real state
 * rather than excusing it, and parking is recorded exactly as an override is.
 */
export function branchSlotDecision({
  branches = [],
  parked = {},
  point = null,
  points = null,
  refs = null,
  looseRefs = false,
  cap = POOL_CAP,
  readable = true,
  now = Date.now(),
} = {}) {
  const targets = [
    ...new Set(
      (Array.isArray(points) && points.length ? points : [point])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ]
  const named = [
    ...new Set((Array.isArray(refs) ? refs : refs ? [refs] : []).map(normRef).filter(Boolean)),
  ]
  // Keep the CURRENT occupancy intact. Earlier cuts excluded every target here
  // and tried to add it back below. That loses a live target in a mixed call:
  // three occupied branches minus the continued target plus one new target read
  // as 2 + 1, although the call really leaves four branches standing.
  const slots = openBranchSlots({ branches, parked, cap, now })
  // HOW MANY BRANCHES WOULD THIS CALL ADD? The count alone answered "two of
  // three taken" to a line cutting TWO more, and left four standing under a cap
  // of three (Sol, review of dd7fd78c). A refusal has to be about the state the
  // call would LEAVE, not the state it starts from.
  //
  // A ref the call names that no branch answers to is one new branch. A target
  // point the call names NO ref for is one new branch unless a branch for it
  // already stands — that is the spawn shape, where the name cannot be known.
  //
  // A PARKED BRANCH THE CALL ASSIGNS WORK TO REOCCUPIES ITS SLOT NOW (fourth
  // review, finding 6). Counting parked branches into the in-flight set read
  // that assignment as `nothing-opened`, so at a full pool the call passed and
  // occupancy exceeded the cap the moment the branch moved — the unpark must
  // happen when work is ASSIGNED, not at the first commit. So the in-flight set
  // holds only the branches that OCCUPY a slot, a reassigned park counts toward
  // `adding`, and `reopens` names the parks the wrapper must clear on allow.
  const standing = [...new Set((Array.isArray(branches) ? branches : []).map((b) => normRef(b?.ref)).filter(Boolean))]
  const live = slots.open.map((b) => b.ref)
  const inFlight = new Set(live.map(pointOfBranch).filter((n) => n !== null))
  const newRefs = named.filter((r) => !standing.some((s) => branchAnswersTo(r, s, { loose: looseRefs })))
  const unnamed = targets.filter((p) => !named.some((r) => pointOfBranch(r) === p))
  const reopens = slots.parkedOut
    .filter(
      (b) =>
        named.some((r) => branchAnswersTo(r, b.ref, { loose: looseRefs })) ||
        // A point-wide assignment cannot distinguish between parked branches.
        // If no live branch carries that point, every park the wrapper clears
        // becomes occupied and therefore every one must be projected here.
        (b.point !== null && unnamed.includes(b.point) && !inFlight.has(b.point)),
    )
    .map((b) => b.ref)
  const reopeningPoints = new Set(reopens.map(pointOfBranch).filter((n) => n !== null))
  const opening = unnamed.filter((p) => !inFlight.has(p) && !reopeningPoints.has(p))
  const adding = newRefs.length + reopens.length + opening.length
  const out = { ...slots, point: targets[0] ?? null, points: targets, refs: named, adding, reopens }
  if (readable !== true) return { ...out, allowed: true, why: 'branches-unreadable' }
  // A call that opens NO new branch is finishing, whatever the pool holds —
  // pushing to a branch that stands must never be refused for the slot it is in.
  if (adding === 0) return { ...out, allowed: true, why: 'nothing-opened' }
  if (slots.count + adding <= slots.cap) return { ...out, allowed: true, why: 'slots-free' }
  return { ...out, allowed: false, why: 'branches-open' }
}

/**
 * The branch refusal's wording. PURE: the point requires it to list the open
 * branches OLDEST FIRST with each one's age and behind-count, and to name the
 * two ways out.
 */
export function branchSlotRefusal(decision = {}, { limit = 10 } = {}) {
  const open = Array.isArray(decision?.open) ? decision.open : []
  const cap = decision?.cap ?? POOL_CAP
  const targets = Array.isArray(decision?.points) && decision.points.length ? decision.points : [decision?.point]
  const named = targets.filter((p) => Number.isInteger(Number(p)) && Number(p) > 0)
  // One call can open two points, and the refusal names both — a message that
  // named one of them would read as if the other had been allowed.
  const n = named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}` : (named[0] ?? null)
  const adding = Number.isFinite(decision?.adding) && decision.adding > 0 ? decision.adding : named.length || 1
  const lines = open.slice(0, limit).map((b) => {
    const age = describeBranchAge(Number.isFinite(b?.ageMs) ? b.ageMs : NaN)
    const behind = Number.isFinite(b?.behind)
      ? `${b.behind} commit${b.behind === 1 ? '' : 's'} behind main`
      : 'behind-count unknown'
    return `  · ${b?.ref} — ${age}, ${behind}`
  })
  if (open.length > limit) lines.push(`  · …and ${open.length - limit} more`)
  // THE REMEDY MUST ACTUALLY LIFT THE REFUSAL (fourth review, finding 7): with
  // three occupied slots and a call opening two branches, landing ONE leaves
  // the same call refused — so the refusal says how many must go, not "one".
  const excess = Math.max(1, (Number.isFinite(decision?.count) ? decision.count : open.length) + adding - cap)
  const howMany = excess > 1 ? `${excess} of them must go` : 'one of them must go'
  // When removing EVERY standing branch still would not make the call fit, the
  // ordinary LAND/PARK remedy is impossible to complete: it asks more branches
  // to go than the list contains. The remaining excess has to come out of the
  // call itself. With an empty pool that is the whole remedy; with a mixed state
  // BOTH actions are required, and saying either one alone would send the
  // operator around the same refusal loop.
  if (excess > open.length && open.length === 0) {
    return (
      `THE CALL ITSELF EXCEEDS THE POOL CAP: no feat/* branches currently occupy a slot, but opening point${
        named.length > 1 ? 's' : ''
      } ${n ?? '?'} would add ${adding} branch${adding === 1 ? '' : 'es'} against a cap of ${cap}. ` +
      `COMMISSION FEWER TARGETS: split this call so it opens at most ${cap} branch${cap === 1 ? '' : 'es'} at once. ` +
      'There is no existing branch to LAND or PARK.'
    )
  }
  if (excess > open.length) {
    const targetsToDrop = excess - open.length
    return (
      `A SLOT IS NOT FREE UNTIL ITS BRANCH IS GONE: ${open.length} open feat/* branch(es) against a pool cap of ` +
      `${cap}${n ? `, so opening point${named.length > 1 ? 's' : ''} ${n} would add ${
        adding > 1 ? `${adding} more` : 'another'
      }` : ''}. Oldest first:\n${lines.join('\n')}\n` +
      `BOTH CHANGES ARE REQUIRED BEFORE THIS CALL FITS: LAND or PARK all ${open.length} standing branch${
        open.length === 1 ? '' : 'es'
      } named above (${BRANCH_LAND_CMD}, or ${BRANCH_PARK_CMD} with a reason), AND COMMISSION ${targetsToDrop} FEWER ` +
      `branch-opening target${targetsToDrop === 1 ? '' : 's'} from this call. Neither action alone frees enough slots.`
    )
  }
  return (
    `A SLOT IS NOT FREE UNTIL ITS BRANCH IS GONE: ${open.length} open feat/* branch(es) against a pool cap of ` +
    `${cap}${n ? `, so opening point${named.length > 1 ? 's' : ''} ${n} would add ${
      adding > 1 ? `${adding} more` : 'another'
    }` : ''}. Oldest first:\n${lines.join('\n')}\n` +
    `TWO WAYS OUT, both explicit, and ${howMany} before this call fits: LAND one (${BRANCH_LAND_CMD}), or PARK ` +
    `it with a reason (${BRANCH_PARK_CMD}), ` +
    'which records the decision and drops the branch out of the count until it moves again. Built work that never ' +
    'lands delivers nothing and costs more to merge every day it ages against a moving main.'
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
/**
 * WHAT MAY CORROBORATE AN EXPIRED LEASE. PURE, and deliberately NOT `judgedOn`.
 *
 * `evidenceVerdict` ranks a live pid ABOVE a fresh log, so a declaration of
 * `--pid` + `--log` — the ordinary shape for a long background verification with
 * no worktree — comes out `'process'` even while the log is being written. For a
 * MESSAGE that ordering is fine (it names the strongest thing present). For the
 * takeover it is wrong, and silently so: `leaseTakeoverDecision` reads
 * breathing-only and dispossesses an owner whose output is demonstrably fresh,
 * contradicting this branch's own rule that `git` and `log` corroborate
 * (four-eyes re-review of point 556). Ranked here instead of in `evidenceVerdict`,
 * because the two questions are genuinely different and the message's ordering is
 * relied on elsewhere.
 *
 * PRODUCED output wins over a bare pid: 'git' > 'log' > 'process' > 'none'.
 */
export function corroborationJudgedOn(items = []) {
  const ok = (Array.isArray(items) ? items : []).filter((i) => i?.ok === true)
  if (ok.some((i) => OUTPUT_KINDS.has(i.kind))) return 'git'
  if (ok.some((i) => i.kind === 'log')) return 'log'
  return ok.some((i) => i.kind === 'pid') ? 'process' : 'none'
}

export function assessOwnerWork({ declaration, lock, now, maxAgeMs = LAUNCHER_WORK_MAX_AGE_MS, ...probes } = {}) {
  const out = (o) => ({
    declared: false,
    advancing: false,
    declaredAt: null,
    reason: 'no-declaration',
    summary: '',
    items: [],
    judgedOn: 'none',
    corroboratedBy: 'none',
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
  const corroboratedBy = corroborationJudgedOn(items)
  if (answerable.length === 0) {
    return out({ declared: current, declaredAt, reason: 'unanswerable', summary, items, judgedOn, corroboratedBy })
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
    corroboratedBy,
  })
}

/** How the reported evidence kind reads in a sentence. */
const JUDGED_ON_WORDS = {
  // Not "git output" any more: the worktree half may be a written FILE (point
  // 434 (5b)), and the per-item detail names which of the two it was.
  git: 'the work’s own output — a commit or a written file',
  process: 'a live process (nothing produced)',
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

// --- THE BOARD'S PROMISE MUST NOT AGE UNDER A DECLARED WAIT (point 661) --------
// The "~HH:MM" on a current-work card is a promise to a reader on a phone, and
// the `now-eta-past` audit speaks only at a turn end (`--synced`/attest). A
// session waiting on a delegated agent produces no turn end for an hour —
// measured 12.08.2026: the published promise stood 50 minutes past while every
// mechanism held green. The waiting heartbeat that DOES still run is the
// re-declaration (`batch-in-flight.mjs --waiting-on`, at most `IN_FLIGHT_MAX_AGE_MS`
// apart), so that is where the check lives: a wait whose now-card ETA already
// lies in the past is refused until the estimate is refreshed, which bounds the
// staleness by the re-declaration interval.

/**
 * The current-work cards whose "~HH:MM" promise has already PASSED. PURE.
 * `html` is the board's content, `nowMinutes` minutes since midnight in
 * Europe/Berlin (the clock the board is written against). Anything unreadable —
 * no html, no clock, no current-work section — answers []: a broken board must
 * never trap the session; only a READABLE promise that broke may refuse.
 * @returns {{points: number[], title: string, meta: string|null, minutesPast: number}[]}
 */
export function pastEtaCards({ html, nowMinutes } = {}) {
  if (typeof html !== 'string' || !Number.isFinite(nowMinutes)) return []
  const nowSection = sliceSections(html).sections[SECTION_TITLES[0]]
  if (typeof nowSection !== 'string') return []
  const out = []
  for (const card of parseCards(nowSection)) {
    const status = etaStatus({ meta: card.meta, nowMinutes })
    if (status && status.state === 'past') {
      out.push({ points: card.points, title: card.title, meta: card.meta, minutesPast: -status.minutesLeft })
    }
  }
  return out
}

/**
 * MAY THIS WAIT BE RECORDED against this board? Null = yes; otherwise the
 * refusal message, naming each broken card and the remedy. Decided here so the
 * Vitest layer sweeps the refusal exactly as the wrapper prints it.
 */
export function waitEtaRefusal({ html, nowMinutes } = {}) {
  const past = pastEtaCards({ html, nowMinutes })
  if (past.length === 0) return null
  const cards = past
    .map((c) => `  point ${c.points.length ? c.points.join(', ') : '?'} — "${c.meta}" (${c.minutesPast} min past)`)
    .join('\n')
  return (
    'the current-work card\'s "~HH:MM" promise has ALREADY PASSED, and a declared wait would let it age ' +
    'unwatched until the next re-declaration:\n' +
    `${cards}\n` +
    `Give each card a realistic new "~HH:MM" (${NOW_CARD_CMD} …), ${REPUBLISH}, then re-declare this wait. ` +
    'Nothing recorded.'
  )
}
