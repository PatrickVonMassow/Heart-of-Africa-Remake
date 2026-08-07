// Pure decision logic for the CI-status Stop hook (ci-status-guard.mjs).
// Classifies the GitHub Actions runs for the pushed HEAD sha and decides
// block/notify. WHERE a red's cause lies — this repository or GitHub's side —
// is decided next door in ci-failure-cause-core.mjs and shapes the message
// blockReason writes. No I/O, never throws — Vitest-covered in
// ci-status-guard-core.test.mjs. Accepts both the `gh run list --json` field
// names (databaseId/headSha/workflowName/url) and the REST API's
// (id/head_sha/name/html_url), since the wrapper feeds the REST shape today
// and gh's shape if that CLI ever gets installed.

const FAILED_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out', 'startup_failure'])
const OK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped'])

function runSha(r) {
  return String((r && (r.headSha ?? r.head_sha)) ?? '')
}
function runId(r) {
  return (r && (r.databaseId ?? r.id)) ?? null
}
function runName(r) {
  return String((r && (r.workflowName ?? r.name)) ?? 'workflow')
}
function runUrl(r) {
  return String((r && (r.url ?? r.html_url)) ?? '')
}

/**
 * Classify the CI state for `headSha` from a list of workflow runs.
 * Per workflow only the NEWEST run counts (a green re-run supersedes its red
 * predecessor). Across workflows: any red → 'failed'; else any unfinished →
 * 'pending'; else any green → 'success'; else 'none' (fail-open).
 * @returns {{state:'failed'|'pending'|'success'|'none', runId?, workflowName?, conclusion?, url?}}
 */
export function classifyRuns(runs, headSha) {
  try {
    if (!Array.isArray(runs) || !headSha) return { state: 'none' }
    const mine = runs.filter((r) => runSha(r) === headSha)
    if (mine.length === 0) return { state: 'none' }

    const newestPerWorkflow = new Map()
    for (const r of mine) {
      const key = runName(r)
      const prev = newestPerWorkflow.get(key)
      if (!prev || Number(runId(r) ?? 0) > Number(runId(prev) ?? 0)) newestPerWorkflow.set(key, r)
    }

    let pending = null
    let success = null
    for (const r of newestPerWorkflow.values()) {
      const status = String(r?.status ?? '')
      const conclusion = String(r?.conclusion ?? '')
      if (status !== 'completed') {
        pending = r // queued / in_progress / waiting — CI still deciding
        continue
      }
      if (FAILED_CONCLUSIONS.has(conclusion)) {
        return {
          state: 'failed',
          runId: runId(r),
          workflowName: runName(r),
          conclusion,
          url: runUrl(r),
        }
      }
      if (OK_CONCLUSIONS.has(conclusion)) success = r
      // unknown conclusion (stale, action_required, …) → counts as nothing (fail-open)
    }
    if (pending) return { state: 'pending', runId: runId(pending), workflowName: runName(pending) }
    if (success) return { state: 'success', runId: runId(success), workflowName: runName(success) }
    return { state: 'none' }
  } catch {
    return { state: 'none' } // pure fail-open — a guard bug never blocks
  }
}

/**
 * EVERY failed run on this head, newest per workflow, in the same shape
 * `classifyRuns` returns for the one it picks.
 *
 * WHY (four-eyes review, 06.08.2026): `classifyRuns` names ONE red, and which
 * one is API list order. That was harmless while every red blocked. It stopped
 * being harmless when a red GitHub caused may waive the block: a famine-shaped
 * watchdog run created a second later would then excuse a genuinely red CI run
 * standing on the same commit. The waiver must be judged against ALL of them.
 */
export function failedRuns(runs, headSha) {
  try {
    if (!Array.isArray(runs) || !headSha) return []
    const newestPerWorkflow = new Map()
    for (const r of runs.filter((x) => runSha(x) === headSha)) {
      const key = runName(r)
      const prev = newestPerWorkflow.get(key)
      if (!prev || Number(runId(r) ?? 0) > Number(runId(prev) ?? 0)) newestPerWorkflow.set(key, r)
    }
    return [...newestPerWorkflow.values()]
      .filter((r) => String(r?.status ?? '') === 'completed' && FAILED_CONCLUSIONS.has(String(r?.conclusion ?? '')))
      .map((r) => ({
        state: 'failed',
        runId: runId(r),
        workflowName: runName(r),
        conclusion: String(r?.conclusion ?? ''),
        url: runUrl(r),
      }))
  } catch {
    return []
  }
}

/**
 * The workflows whose NEWEST run on this head reached a verdict that is not a
 * failure — i.e. the ones that demonstrably recovered.
 *
 * WHY (four-eyes review, 06.08.2026, finding 1): the outage waiver's clock is
 * kept per workflow, and the guard returns early on a head that is not red —
 * so without this the clock would survive the recovery. The next genuine famine
 * for that workflow would then read as an already-expired waiver and escalate at
 * once, with an absurd age, in the FALSE-ALARM direction.
 */
export function recoveredWorkflows(runs, headSha) {
  try {
    if (!Array.isArray(runs) || !headSha) return []
    const newestPerWorkflow = new Map()
    for (const r of runs.filter((x) => runSha(x) === headSha)) {
      const key = runName(r)
      const prev = newestPerWorkflow.get(key)
      if (!prev || Number(runId(r) ?? 0) > Number(runId(prev) ?? 0)) newestPerWorkflow.set(key, r)
    }
    return [...newestPerWorkflow.entries()]
      .filter(([, r]) => String(r?.status ?? '') === 'completed' && !FAILED_CONCLUSIONS.has(String(r?.conclusion ?? '')))
      .map(([name]) => name)
  } catch {
    return []
  }
}

/** Only a confirmed red blocks; pending/success/none/unknown all allow. */
export function shouldBlock(state) {
  return state === 'failed'
}

// ---------------------------------------------------------------------------
// CONFIRM GREEN, not "notice red" (point 387, 30.07.2026).
//
// The guard used to ask about `git rev-parse HEAD` alone. Through the night of
// 30.07. the owning session's HEAD was `main` and green while every push of a
// delegated agent's branch failed CI: thirteen "Run failed" mails, and the one
// session that could have fixed it never learned. A delegated agent pushes under
// the parent's session id, so those refs ARE the parent's responsibility.
//
// So the unit of judgement is the PUSHED REF, and the demand is not "notice a
// red" but "confirm the run for that exact sha CONCLUDED green" — which closes
// the whole class regardless of cause, platform differences included, where
// merely noticing red closes only the cases someone happens to look at.
//
// CHEAPNESS IS PART OF THE SPEC: the overwhelmingly common turn pushes nothing
// and must cost nothing. The ref list therefore comes from the local reflog of
// pushes (four local git calls in the wrapper, no network, no per-branch API
// sweep), and every answer that can never change again is cached per sha, so a
// repeat turn asks GitHub nothing at all.
// ---------------------------------------------------------------------------

/** How far back a push still counts as this session's outstanding work. */
export const PUSH_WINDOW_MS = 24 * 60 * 60 * 1000
/** How long a pushed sha may show NO run before we accept that none will come
 *  (a branch no workflow covers — `board`, a worktree branch). */
export const RUN_GRACE_MS = 3 * 60 * 1000
/** How long an unfinished run is waited for before the wait fails OPEN. A wait
 *  without a ceiling would trap a session behind a queue that never drains. */
export const WAIT_BUDGET_MS = 30 * 60 * 1000
/** Minimum spacing between two API calls for the same non-terminal sha, so a
 *  blocked or waiting session re-asks about once a minute, not once a turn. */
export const RECHECK_MS = 60 * 1000
/** How long an outage-waiver clock may sit unrefreshed before it is forgotten. */
export const FAMINE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** `%gD` under `--date=unix`: `refs/remotes/origin/x@{1786125241}`. */
const REFLOG_LINE = /^(.+)@\{(\d+)\}\t([0-9a-f]{7,40})\t(.*)$/

/**
 * The refs THIS repository pushed, newest push per ref, from
 * `git reflog --date=unix --format='%gD%x09%H%x09%gs' --all`.
 *
 * A push is the only reflog message that proves WE sent it — a fetch writes
 * "fetch:" and would hand us every branch anyone else moved. Entries outside the
 * window are dropped, so the list is bounded by recent activity rather than by
 * repository age.
 */
export function pushedRefsFromReflog(text, { now = Date.now(), windowMs = PUSH_WINDOW_MS } = {}) {
  try {
    const newest = new Map()
    for (const line of String(text ?? '').split(/\r?\n/)) {
      const m = REFLOG_LINE.exec(line)
      if (!m) continue
      const [, selector, ts, sha, message] = m
      if (!selector.startsWith('refs/remotes/')) continue
      if (!/^update by push\b/.test(message)) continue
      const at = Number(ts) * 1000
      if (!Number.isFinite(at) || at <= 0 || now - at > windowMs) continue
      const ref = selector.slice('refs/remotes/'.length)
      const prev = newest.get(ref)
      if (!prev || at > prev.at) newest.set(ref, { ref, sha, at })
    }
    return [...newest.values()].sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

/**
 * The shas to ask GitHub about, in the order they matter: HEAD's own first, then
 * the remaining pushes newest first.
 *
 * A ref that no longer exists is DROPPED — a branch deleted after its merge must
 * not be reported forever. A sha reached under two names is asked about once.
 * HEAD is included when it is pushed but carries no push reflog entry of ours
 * (pushed from another clone), which keeps the guard's old guarantee intact.
 */
export function refTargets({ pushed = [], existingRefs = [], headSha = '', headPushed = false } = {}) {
  try {
    const exists = new Set(existingRefs)
    const seenShas = new Set()
    const live = []
    for (const p of [...pushed].sort((a, b) => Number(b?.at ?? 0) - Number(a?.at ?? 0))) {
      if (!p?.ref || !p?.sha || !exists.has(p.ref) || seenShas.has(p.sha)) continue
      seenShas.add(p.sha)
      live.push({ ref: p.ref, sha: p.sha, at: Number(p.at) || 0 })
    }
    // HEAD's own sha leads: it is what the session is standing on.
    live.sort((a, b) => (a.sha === headSha ? -1 : 0) - (b.sha === headSha ? -1 : 0))
    if (headPushed && headSha && !seenShas.has(headSha)) live.push({ ref: 'HEAD', sha: headSha, at: 0 })
    return live
  } catch {
    return []
  }
}

/**
 * The cached answer for a sha, or null when GitHub must be asked again.
 * `success`/`nocheck` are terminal — the run for a sha concluded once and for
 * all, so they are never re-asked. `pending`/`failed` are NOT: a re-run turns a
 * red green and an unfinished run finishes, so they only mute the API for
 * RECHECK_MS, which is what keeps a blocked session from hammering it.
 */
export function cachedAnswer(entry, now = Date.now(), recheckMs = RECHECK_MS) {
  try {
    const state = String(entry?.state ?? '')
    if (state === 'success' || state === 'nocheck') return state
    if (state === 'pending' || state === 'failed') {
      return now - Number(entry?.checkedAt ?? 0) < recheckMs ? state : null
    }
    return null
  } catch {
    return null
  }
}

/**
 * What a classified run state means for a pushed sha.
 *   red      — block, and say which ref.
 *   green    — landed; cache it and never ask again.
 *   wait     — the run has not concluded; NOT a pass.
 *   gave-up  — waited past the budget; fail OPEN with a stated reason.
 *   nocheck  — no run appeared within the grace; no workflow covers this COMMIT
 *              (a board push, a worktree branch, a `[skip ci]` rescue commit).
 *   pass     — no run yet, still inside the grace: allow, but do NOT cache, so
 *              the run that appears a second later is still judged next turn.
 */
export function refVerdict({ state, at = 0, now = Date.now(), graceMs = RUN_GRACE_MS, waitBudgetMs = WAIT_BUDGET_MS } = {}) {
  const age = now - (Number(at) || 0)
  if (state === 'failed') return 'red'
  if (state === 'success') return 'green'
  if (state === 'pending') return age > waitBudgetMs ? 'gave-up' : 'wait'
  return age > graceMs ? 'nocheck' : 'pass'
}

/** Drop cache entries older than the push window — a sha that far back is no
 *  longer a target, so keeping it only grows the file. */
export function pruneShaCache(cache, now = Date.now(), windowMs = PUSH_WINDOW_MS) {
  const out = {}
  try {
    for (const [sha, entry] of Object.entries(cache ?? {})) {
      const seen = Number(entry?.firstSeenAt ?? entry?.checkedAt ?? 0)
      if (seen > 0 && now - seen <= windowMs) out[sha] = entry
    }
  } catch {
    /* fail-open: a broken cache is an empty cache, never a thrown guard */
  }
  return out
}

/** Keep only the alert bookkeeping of refs that still exist, so a deleted branch
 *  does not sit in the state file forever. An EMPTY ref list means the git call
 *  failed, not that every branch is gone — pruning on it would drop the dedup
 *  and re-alert a red already reported, so it prunes nothing. */
export function pruneNotifiedRefs(notified, existingRefs = []) {
  let all = {}
  try {
    all = { ...(notified ?? {}) }
  } catch {
    return {} // an unreadable state file is an empty one — nothing to keep
  }
  try {
    if (!Array.isArray(existingRefs) || existingRefs.length === 0) return all
    const keep = new Set([...existingRefs, 'HEAD'])
    const out = {}
    for (const [ref, key] of Object.entries(all)) if (keep.has(ref)) out[ref] = key
    return out
  } catch {
    // Fail-open here means KEEPING the bookkeeping: dropping it would re-alert a
    // red already reported, which is what the empty-list branch above refuses.
    return all
  }
}

/** Drop outage-waiver clocks older than the window. A workflow whose ref was
 *  deleted before it ever recovered would otherwise keep its clock forever, and
 *  the next genuine famine would inherit it as already expired — the
 *  false-alarm direction (four-eyes residual (c)). */
export function pruneFamine(famine, now = Date.now(), ttlMs = FAMINE_TTL_MS) {
  const out = {}
  try {
    for (const [name, since] of Object.entries(famine ?? {})) {
      if (Number(since) > 0 && now - Number(since) <= ttlMs) out[name] = Number(since)
    }
  } catch {
    /* fail-open */
  }
  return out
}

/**
 * The per-ref alert bookkeeping, migrating the single-sha form the file used
 * while the guard watched HEAD alone. Keyed 'HEAD' on the way in, so a red that
 * was already alerted may alert once more under its ref's real name — once ever,
 * at the upgrade, which is cheaper than dropping the dedup entirely.
 */
export function notifiedFromState(state) {
  try {
    if (state?.notifiedRefs && typeof state.notifiedRefs === 'object') return { ...state.notifiedRefs }
    return state?.notifiedSha ? { HEAD: String(state.notifiedSha) } : {}
  } catch {
    return {}
  }
}

/**
 * THE SWEEP: judge every pushed target and return the turn-end decision.
 *
 * All I/O is INJECTED (`fetchRuns`, `judgeRed`, `notify`), so the whole
 * confirm-green rule — what is asked, what is cached, what blocks, what notifies
 * and what fails open — is decided here and covered by Vitest without a network
 * or a repository. The wrapper only supplies the GitHub API and ntfy.
 *
 * @returns {{decision: string|null, cache, notified, famine, failedOpen: string[], dirty: boolean}}
 */
export async function sweepTargets({
  targets = [],
  cache = {},
  notified = {},
  famine = {},
  now = Date.now(),
  fetchRuns,
  judgeRed,
  notify,
} = {}) {
  const nextCache = { ...cache }
  const nextNotified = { ...notified }
  const nextFamine = { ...famine }
  const failedOpen = []
  // The waiver clocks this sweep touched, applied once at the end so the order
  // of the targets cannot decide them.
  const judgedNames = new Set()
  const famishedNames = new Map()
  let block = null // the first red something can be done about
  let waiting = null // the first run that has not concluded
  let dirty = false

  for (const target of targets) {
    const entry = nextCache[target.sha]
    const cached = cachedAnswer(entry, now)
    // A sha whose run CONCLUDED green (or that no workflow covers) is never
    // asked about again — this is what keeps the repeat turn free.
    if (cached === 'success' || cached === 'nocheck') continue
    if (cached === 'failed') {
      if (entry.reason) block ??= entry.reason
      continue
    }
    if (cached === 'pending') {
      // The BUDGET outranks the cache: a wait recorded a minute ago must not
      // keep blocking once the ceiling has passed in the meantime (four-eyes
      // residual (b)). Past it the entry still mutes the API, it just no longer
      // holds the turn.
      if (refVerdict({ state: 'pending', at: Number(entry.firstSeenAt) || now, now }) === 'wait') {
        waiting ??= entry.reason
      }
      continue
    }

    const at = Number(target.at) || Number(entry?.firstSeenAt) || now
    const runs = await fetchRuns(target.sha)
    if (!runs) {
      // Offline / rate-limited / API error → fail OPEN, with the reason STATED
      // rather than swallowed: a silent fail-open is indistinguishable from a
      // green, and that confusion is what this point exists to end.
      failedOpen.push(`${target.ref} ${String(target.sha).slice(0, 7)}: GitHub Actions could not be read`)
      continue
    }
    const classification = classifyRuns(runs, target.sha)
    const verdict = refVerdict({ state: classification.state, at, now })
    dirty = true

    if (verdict === 'green') {
      // THE WAIVER CLOCK IS CLEARED ON THE WAY OUT: a stale timestamp would make
      // the NEXT famine for that workflow read as an already-expired waiver and
      // escalate on its first sighting.
      for (const name of recoveredWorkflows(runs, target.sha)) delete nextFamine[name]
      nextCache[target.sha] = { state: 'success', firstSeenAt: at, checkedAt: now }
      continue
    }
    if (verdict === 'gave-up') {
      // Waited past the budget: allow the stop and SAY so — but keep asking. The
      // answer is cached as unfinished, not as final, so the run that concludes
      // an hour later is still judged (four-eyes finding 3): the runner famine
      // that motivated this guard is exactly the case that takes that long.
      failedOpen.push(`${target.ref} ${String(target.sha).slice(0, 7)}: its run never concluded — waited past the budget`)
      nextCache[target.sha] = { state: 'pending', firstSeenAt: at, checkedAt: now }
      continue
    }
    if (verdict === 'nocheck') {
      // No run appeared within the grace, so no workflow covers THIS COMMIT —
      // a `board` push, a worktree branch, or a rescue commit marked `[skip ci]`.
      // Remembered per SHA and never per ref: a ref written off for a week would
      // silently pass the red of the very next commit on it, and a `[skip ci]`
      // rescue push is the routine way onto that path (four-eyes finding 1).
      nextCache[target.sha] = { state: 'nocheck', firstSeenAt: at, checkedAt: now }
      continue
    }
    if (verdict === 'wait') {
      const reason = waitReason(target, classification)
      waiting ??= reason
      nextCache[target.sha] = { state: 'pending', firstSeenAt: at, checkedAt: now, reason }
      continue
    }
    if (verdict === 'pass') {
      // No run YET, still inside the grace: allow, but cache nothing conclusive,
      // so the run that appears a second later is still judged next turn.
      nextCache[target.sha] = { state: 'seen', firstSeenAt: at, checkedAt: now }
      continue
    }

    // RED. WHERE the fault lies decides the remedy: a red the repository cannot
    // fix must not demand a fixing push (point 526), and EVERY failed run on the
    // sha is judged, not just the one classifyRuns names (four-eyes 06.08.2026).
    const { classification: chosen, standDown, stillFamished, judgedWorkflows } = await judgeRed({
      sha: target.sha,
      runs,
      // What this sweep has learned so far included, so a second red target on
      // the same workflow still sees the EARLIEST famine timestamp.
      famine: { ...nextFamine, ...Object.fromEntries(famishedNames) },
      classification,
      now,
    })
    // The waiver clock follows the verdict in BOTH directions: a workflow judged
    // unactionable keeps (or starts) its clock, one judged actionable loses it.
    // Only adding would leave a stale clock behind, so the next genuine famine
    // would read as an already-expired waiver and escalate at once — the
    // false-alarm direction (four-eyes finding 4). Collected across the WHOLE
    // sweep and applied at the end, so which target ran first cannot decide the
    // clock of a workflow that is red on two of them (residual (c)).
    for (const name of judgedWorkflows ?? []) judgedNames.add(name)
    for (const [name, since] of Object.entries(stillFamished ?? {})) famishedNames.set(name, since)

    // A stood-down red gets a REPEATED alert, not one ever (four-eyes S1): in a
    // runner famine no step runs, so ci.yml's own `if: failure()` alert never
    // fires either. Dedup per (ref, sha) alone would leave a permanently broken
    // main pinging exactly once and never blocking.
    const alertKey = standDown
      ? `${target.sha}:${chosen.runId}:${new Date(now).toISOString().slice(0, 13)}`
      : target.sha
    if (shouldNotify(chosen.state, nextNotified[target.ref], alertKey)) {
      await notify({ target, classification: chosen, standDown })
      nextNotified[target.ref] = alertKey
    }

    // A red with NOTHING to do is reported, not sat on (point 528): holding the
    // turn end over GitHub's own outage clears nothing and stops the batch.
    const reason = standDown ? null : blockReason(chosen, target.sha, target.ref)
    nextCache[target.sha] = { state: 'failed', firstSeenAt: at, checkedAt: now, reason }
    if (reason) block ??= reason
  }

  // A workflow still dying the famine way KEEPS its clock; one this sweep judged
  // and did not find famished loses it. Applied here, not per target.
  for (const name of judgedNames) if (!famishedNames.has(name)) delete nextFamine[name]
  for (const [name, since] of famishedNames) nextFamine[name] = since

  return {
    decision: block ?? waiting ?? null,
    cache: nextCache,
    notified: nextNotified,
    famine: nextFamine,
    failedOpen,
    dirty,
  }
}

/** The wait message: honest about what is missing and what clears it. */
export function waitReason(target, classification) {
  const t = target ?? {}
  const c = classification ?? {}
  return (
    `GitHub CI has NOT yet concluded for the pushed ref ${t.ref ?? '?'} ` +
    `(${String(t.sha ?? '').slice(0, 7)}): workflow "${c.workflowName ?? '?'}" run ${c.runId ?? '?'} ` +
    `is still running. A push is not landed until its run is GREEN, and an unfinished ` +
    `run is a wait, not a pass. Sleep about 90 s, then end the turn again — this clears ` +
    `by itself once the run concludes green, fails open after ${Math.round(WAIT_BUDGET_MS / 60000)} ` +
    `minutes, and the user pausing the batch via .claude/batch-paused clears it too.`
  )
}

/** Push exactly once per failing sha (the state file remembers the last one). */
export function shouldNotify(state, alreadyNotifiedSha, headSha) {
  return state === 'failed' && Boolean(headSha) && alreadyNotifiedSha !== headSha
}

/** The Stop-block reason: name the run, WHERE the fault lies, and the way out.
 *  `classification.cause` comes from ci-failure-cause-core (the wrapper adds it
 *  once it has read the run's jobs); without it the message reads exactly as
 *  before — a repository fault, fixed by a push.
 *  `refName` NAMES the pushed ref (point 387): "main is green" was true on the
 *  night thirteen branch runs failed, so a message that says only "HEAD" points
 *  the reader at the wrong commit. */
export function blockReason(classification, headSha, refName = 'HEAD') {
  const sha7 = String(headSha ?? '').slice(0, 7)
  const c = classification ?? {}
  const where = refName && refName !== 'HEAD' ? `ref ${refName}` : 'HEAD'
  const head =
    `GitHub CI is RED for the pushed ${where} ${sha7}: workflow "${c.workflowName ?? '?'}" ` +
    `run ${c.runId ?? '?'} concluded "${c.conclusion ?? '?'}"${c.url ? ` — ${c.url}` : ''}. `
  const trail = `(With gh installed: gh run view ${c.runId ?? '<id>'} --log-failed.) `

  if (c.cause === 'external' || c.cause === 'unknown') {
    const outside =
      c.cause === 'external'
        ? 'THIS RED IS NOT IN THE REPOSITORY — no fixing push exists for it: '
        : 'The side this red sits on could not be determined: '
    return (
      head +
      outside +
      `${c.detail ?? ''}. ${c.remedy ?? ''} ${trail}` +
      `Once that run is green this clears by itself; the user pausing the batch ` +
      `via .claude/batch-paused also clears it.`
    )
  }

  return (
    head +
    (c.detail ? `${c.detail}. ` : '') +
    `Reproduce the fast gate locally (npm run build && npm run lint && ` +
    `node scripts/audit-check.mjs && npm run test:unit), fix the cause, commit and push — ` +
    `CI green is part of done. ${trail}` +
    `Only a fixing push (or the user pausing the batch via .claude/batch-paused) clears this.`
  )
}
