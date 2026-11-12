// Housekeeping rules (point 1509) — PURE. Every decision the housekeeping run
// makes about deleting something lives here, so it can be tested without a disk.
// The shell (scripts/housekeeping.mjs) only gathers facts and acts on verdicts.
//
// ONE rule set for the recurring run and the one-off pass. Every rule fails
// CLOSED: an unreadable input, an unparseable status or an unknown liveness
// answers "keep".

export const DAY_MS = 24 * 60 * 60 * 1000

/** Calibratable thresholds (point 1509 spec). */
export const TMP_MAX_AGE_MS = 7 * DAY_MS
export const TOOL_LOG_MAX_AGE_MS = 14 * DAY_MS
export const SPAWN_INTERVAL_MS = DAY_MS
export const DEFAULT_BUDGET_ENTRIES = 50_000
export const DEFAULT_BUDGET_MS = 10 * 60 * 1000
/** A lock whose content cannot be parsed is treated as held until it is this old. */
export const UNREADABLE_LOCK_STALE_MS = DAY_MS
export const PID_START_TOLERANCE_MS = 2000

// ---------------------------------------------------------------------------
// Work order: which points are closed, which are open, and the open text.

const POINT_LINE = /^- \[( |x|X)\] (\d+)\./
const BLOCK_END = /^(- \[|#{1,6} )/

/**
 * Parse TASKS.md (open work) and docs/tasks-archive.md (closed work).
 * Returns { ok:false, reason } when either text is missing or carries no point
 * line at all — a reformat or a failed read, never "nothing is open".
 * `closed` holds only numbers ticked in the archive AND absent from TASKS.md's
 * open lines (a conflict keeps). `openText` is the concatenated text of every
 * open point block, for reference matching.
 */
export function parseWorkOrder(tasksText, archiveText) {
  if (typeof tasksText !== 'string' || typeof archiveText !== 'string') return { ok: false, reason: 'work order unreadable' }
  const open = new Set()
  const tickedInTasks = new Set()
  const openBlocks = []
  let current = null
  let sawTasksPoint = false
  for (const line of tasksText.split('\n')) {
    const m = POINT_LINE.exec(line)
    if (m) {
      sawTasksPoint = true
      if (current) openBlocks.push(current.join('\n'))
      current = null
      const n = Number(m[2])
      if (m[1] === ' ') {
        open.add(n)
        current = [line]
      } else {
        tickedInTasks.add(n)
      }
      continue
    }
    if (BLOCK_END.test(line)) {
      if (current) openBlocks.push(current.join('\n'))
      current = null
      continue
    }
    if (current) current.push(line)
  }
  if (current) openBlocks.push(current.join('\n'))
  const closed = new Set()
  let sawArchivePoint = false
  for (const line of archiveText.split('\n')) {
    const m = POINT_LINE.exec(line)
    if (!m) continue
    sawArchivePoint = true
    const n = Number(m[2])
    if (m[1] !== ' ' && !open.has(n)) closed.add(n)
    else if (m[1] === ' ') open.add(n)
  }
  // An archive line left unticked is open; it must not stay in `closed`.
  for (const n of open) closed.delete(n)
  if (!sawTasksPoint) return { ok: false, reason: 'TASKS.md carries no point line' }
  if (!sawArchivePoint) return { ok: false, reason: 'docs/tasks-archive.md carries no point line' }
  return { ok: true, open, closed, openText: openBlocks.join('\n'), tickedInTasks }
}

// ---------------------------------------------------------------------------
// Names: denylist, allowlist, artifact kinds.

/** Never touched, numbered or not: user material, secrets, tools, baselines. */
const DENY = [
  /^bugreports?/i,
  /\.zip$/i,
  /^screenshots$/i,
  /^assets-src$/i,
  /^hoa-state-/i,
  /^villager-build/i,
  /draft/i,
  /^memory\./i,
  /auth/i,
  /credential/i,
  /token/i,
  /secret/i,
  /password/i,
  /\.(pem|key)$/i,
  /^git-credential-/i,
  /^tools$/i,
  /^dashboard$/i,
  /^branch-archive$/i,
  // Baseline consumers (scripts/verify/baseline-classify.mjs, run-record.mjs,
  // polish-villagers.mjs): local/verify-baseline*, verify-logs, verify-measure.
  /^verify-/i,
  /^housekeeping$/i,
  /^\.git$/i,
]

export function isDenied(name) {
  return DENY.some((re) => re.test(String(name)))
}

const NUMBERED = /^(\d+)-(.+)$/

/**
 * The inventoried artifact kind of a numbered local/ entry, or null (= keep).
 * Only these kinds may ever go: logs, frames, evidence, pics, review/author output.
 */
export function artifactKind(name, { isDir, isFile }) {
  const m = NUMBERED.exec(String(name))
  if (!m) return null
  const rest = m[2].toLowerCase()
  if (isDir) {
    if (/(^|-)(frames?|shots|screens|captures)(-|$)/.test(rest)) return 'frames'
    if (/(^|-)evidence(-|$)/.test(rest)) return 'evidence'
    if (/(^|-)(pics|pictures|images)(-|$)/.test(rest)) return 'pics'
    if (/(^|-)(review|author|astra|sol)(-|$)/.test(rest)) return 'review'
    return null
  }
  if (isFile) {
    if (/\.(png|jpe?g|webp)$/.test(rest)) return 'pics'
    if (/\.(log|out|err)$/.test(rest)) return 'log'
    if (/(^|-)(review|author|verdict|astra|sol)(-|\.)/.test(rest) && /\.(md|txt|json|jsonl)$/.test(rest)) return 'review'
    return null
  }
  return null
}

export function pointOf(name) {
  const m = NUMBERED.exec(String(name))
  return m ? Number(m[1]) : null
}

/** True when any reference text names the entry. Substring on purpose: a path
 *  into the entry (`local/<name>/x.png`) or a bare mention keeps it. */
export function isReferenced(name, refTexts) {
  const needle = String(name)
  if (!needle) return true
  return refTexts.some((t) => typeof t === 'string' && t.includes(needle))
}

/**
 * The local/ verdict for one top-level entry. Inputs are facts gathered by the
 * shell; anything missing answers keep.
 *   entry: { name, isDir, isFile, isSymlink }
 *   workOrder: parseWorkOrder() result
 *   refTexts: string[] (open point text + reference docs), or null when unreadable
 */
export function localVerdict(entry, { workOrder, refTexts }) {
  const { name } = entry
  if (entry.isSymlink) return { act: false, reason: 'symlink' }
  if (isDenied(name)) return { act: false, reason: 'denylist' }
  const point = pointOf(name)
  if (point === null) return { act: false, reason: 'not numbered' }
  const kind = artifactKind(name, entry)
  if (!kind) return { act: false, reason: 'not an inventoried artifact kind' }
  if (!workOrder || !workOrder.ok) return { act: false, reason: 'work order unreadable' }
  if (!Array.isArray(refTexts)) return { act: false, reason: 'reference docs unreadable' }
  if (workOrder.open.has(point)) return { act: false, reason: `point ${point} open` }
  if (!workOrder.closed.has(point)) return { act: false, reason: `point ${point} not closed` }
  if (isReferenced(name, refTexts)) return { act: false, reason: 'referenced' }
  return { act: true, rule: `local-closed-${kind}`, point, kind }
}

/** The tool-output-logs verdict for one file (rule 6). */
export function toolLogVerdict(entry, { now, mtimeMs, refTexts, maxAgeMs = TOOL_LOG_MAX_AGE_MS }) {
  if (entry.isSymlink) return { act: false, reason: 'symlink' }
  if (!entry.isFile) return { act: false, reason: 'not a file' }
  if (isDenied(entry.name)) return { act: false, reason: 'denylist' }
  if (!Number.isFinite(mtimeMs)) return { act: false, reason: 'mtime unknown' }
  if (now - mtimeMs <= maxAgeMs) return { act: false, reason: 'young' }
  if (!Array.isArray(refTexts)) return { act: false, reason: 'reference docs unreadable' }
  if (isReferenced(entry.name, refTexts)) return { act: false, reason: 'referenced' }
  return { act: true, rule: 'tool-log-age' }
}

// ---------------------------------------------------------------------------
// /tmp (rule 5).

const CACHE_NAME = /^[A-Za-z0-9_-]{6,}$/
const CACHE_FILE = /^[A-Za-z0-9_.-]+$/

/**
 * A random-named Vite/Vitest cache dir: only `ssr/` and/or `web/` subdirs, each
 * holding only regular hash-named files. `shape` is
 * { name, children: [{ name, isDir, isSymlink, children: [{ name, isFile, isSymlink }] }] }.
 */
export function isViteCacheShape(shape) {
  if (!shape || !CACHE_NAME.test(String(shape.name))) return false
  const kids = shape.children
  if (!Array.isArray(kids) || kids.length === 0 || kids.length > 2) return false
  for (const k of kids) {
    if (k.isSymlink || !k.isDir || (k.name !== 'ssr' && k.name !== 'web')) return false
    if (!Array.isArray(k.children)) return false
    for (const f of k.children) {
      if (f.isSymlink || !f.isFile || !CACHE_FILE.test(String(f.name))) return false
    }
  }
  return true
}

/** Which /tmp rule a top-level name may fall under: 'vite-cache' (shape still
 *  required), 'hoa-log', or null. */
export function tmpCandidateRule(name) {
  if (/^(hoa|point)-/.test(String(name))) return 'tmp-hoa-log'
  if (CACHE_NAME.test(String(name))) return 'tmp-vite-cache'
  return null
}

/** True when `path` or anything inside it is held open by a live process. */
export function heldOpen(path, openPaths) {
  const prefix = path.endsWith('/') ? path : `${path}/`
  for (const p of openPaths) {
    if (p === path || p.startsWith(prefix)) return true
  }
  return false
}

/** The cheap part of the /tmp verdict, before any traversal: rule and shape. */
export function tmpShapeVerdict({ name, isSymlink, shape }) {
  if (isSymlink) return { ok: false, reason: 'symlink' }
  const rule = tmpCandidateRule(name)
  if (!rule) return { ok: false, reason: 'no rule' }
  if (rule === 'tmp-vite-cache' && !isViteCacheShape(shape)) return { ok: false, reason: 'not a cache shape' }
  return { ok: true, rule }
}

/**
 * The /tmp verdict for one top-level entry.
 *   facts: { name, isSymlink, newestMtimeMs, complete, shape?, canonical }
 *   liveness: { ok, openPaths } — ok=false skips the whole step upstream
 */
export function tmpVerdict(facts, { now, liveness, maxAgeMs = TMP_MAX_AGE_MS }) {
  const pre = tmpShapeVerdict(facts)
  if (!pre.ok) return { act: false, reason: pre.reason }
  const { rule } = pre
  if (!facts.complete) return { act: false, reason: 'scan incomplete' }
  if (!Number.isFinite(facts.newestMtimeMs)) return { act: false, reason: 'mtime unknown' }
  if (now - facts.newestMtimeMs <= maxAgeMs) return { act: false, reason: 'young' }
  if (!liveness || !liveness.ok) return { act: false, reason: 'liveness unknown' }
  if (heldOpen(facts.canonical, liveness.openPaths)) return { act: false, reason: 'held open by a live process' }
  return { act: true, rule }
}

// ---------------------------------------------------------------------------
// Containment and worktrees (rules 3 and 4).

/** Canonical containment: `path` strictly inside `root`. */
export function isContained(path, root) {
  if (typeof path !== 'string' || typeof root !== 'string' || !path || !root) return false
  const r = root.endsWith('/') ? root : `${root}/`
  return path.startsWith(r) && path.length > r.length
}

/** True when the candidate is a worktree root, contains one, or lies in one
 *  other than the main checkout. `worktreeRoots` excludes the main checkout. */
export function touchesWorktree(canonical, worktreeRoots) {
  for (const w of worktreeRoots) {
    if (w === canonical || isContained(w, canonical) || isContained(canonical, w)) return true
  }
  return false
}

/** `git worktree list --porcelain` → worktree root paths. */
export function parseWorktreeList(text) {
  if (typeof text !== 'string' || !/^worktree /m.test(text)) return null
  return text
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length).trim())
}

// ---------------------------------------------------------------------------
// Liveness and busy processes (rules 5 and 9).

const BUSY = /scripts[/\\](verify[/\\](run-all|run-wait|run-logged)|land-point|picture-stability)\.mjs/

/** True when a verify suite or land-point runs. null input = unknown. */
export function busyVerdict(cmdlines) {
  if (!Array.isArray(cmdlines)) return null
  return cmdlines.some((c) => BUSY.test(String(c)))
}

// ---------------------------------------------------------------------------
// Git (rules 9 and 10).

/**
 * mode: 'auto' (recurring) | 'full' (one-off) | 'off'.
 * busy: true/false/null(unknown). Full mode needs free >= .git bytes.
 */
export function gitPlan({ mode, busy, freeBytes, gitBytes }) {
  if (mode === 'off') return { run: false, reason: 'git step off' }
  if (busy === null || busy === undefined) return { run: false, reason: 'process table unreadable' }
  if (busy) return { run: false, reason: 'a verify suite or land-point is running' }
  if (mode === 'auto') return { run: true, args: ['-c', 'gc.autoDetach=false', 'gc', '--auto'] }
  if (mode === 'full') {
    if (!Number.isFinite(freeBytes) || !Number.isFinite(gitBytes)) return { run: false, reason: 'headroom unknown' }
    if (freeBytes < gitBytes) return { run: false, reason: `headroom ${freeBytes} < .git ${gitBytes}` }
    return { run: true, args: ['-c', 'gc.autoDetach=false', 'gc'] }
  }
  return { run: false, reason: `unknown git mode ${mode}` }
}

// ---------------------------------------------------------------------------
// Budget (rule 7).

export function createBudget({ maxEntries = DEFAULT_BUDGET_ENTRIES, maxMs = DEFAULT_BUDGET_MS, clock = Date.now } = {}) {
  const startedAt = clock()
  let spent = 0
  return {
    spend(n = 1) {
      spent += n
      return !this.exhausted()
    },
    exhausted() {
      return spent >= maxEntries || clock() - startedAt >= maxMs
    },
    get spent() {
      return spent
    },
  }
}

// ---------------------------------------------------------------------------
// Lock (rule 11).

/**
 * lock: parsed lock record ({ pid, pidStartedAt, startedAt }), 'unreadable', or null (absent).
 * probe: { exists, startedAt } for lock.pid.
 * Returns 'free' | 'held' | 'stale'.
 */
export function lockVerdict({ lock, probe, now, lockMtimeMs }) {
  if (lock === null || lock === undefined) return 'free'
  if (lock === 'unreadable' || typeof lock !== 'object') {
    return Number.isFinite(lockMtimeMs) && now - lockMtimeMs > UNREADABLE_LOCK_STALE_MS ? 'stale' : 'held'
  }
  const pid = Number(lock.pid)
  if (!Number.isInteger(pid) || pid <= 0) return 'held'
  if (!probe) return 'held'
  if (!probe.exists) return 'stale'
  const recorded = Number(lock.pidStartedAt)
  if (Number.isFinite(recorded) && Number.isFinite(probe.startedAt)) {
    return Math.abs(recorded - probe.startedAt) <= PID_START_TOLERANCE_MS ? 'held' : 'stale'
  }
  return 'held'
}

// ---------------------------------------------------------------------------
// Scheduling (rule 11) — the launcher's only question.

/** Spawn when neither this daemon's last spawn nor the script's last attempt
 *  lies within the interval. */
export function spawnDecision({ now, lastSpawnAt, lastAttemptAt, intervalMs = SPAWN_INTERVAL_MS }) {
  const last = Math.max(Number(lastSpawnAt) || 0, Number(lastAttemptAt) || 0)
  if (now - last < intervalMs) return { spawn: false, reason: 'ran within the interval' }
  return { spawn: true, reason: last ? 'interval elapsed' : 'never ran' }
}

// ---------------------------------------------------------------------------
// Failures (rule 12): one finding per failure kind until it recovers.

/**
 * reported: kinds already filed as findings. current: kinds failing this run.
 * A kind absent from this run's failures is cleared, so a later recurrence
 * files again.
 */
export function failuresToFile({ reported = [], current = [] }) {
  const known = new Set(reported)
  const now = [...new Set(current)]
  return { file: now.filter((k) => !known.has(k)), nextReported: now }
}

// ---------------------------------------------------------------------------
// Manifest (rule 8).

export function manifestLine({ runId, path, size, rule, outcome, reason }) {
  return JSON.stringify({ runId, path, size: Number.isFinite(size) ? size : null, rule, outcome, ...(reason ? { reason } : {}) })
}

export function summaryLine({ runId, ...rest }) {
  return JSON.stringify({ runId, type: 'summary', ...rest })
}
