// DECLARING WORK THAT IS IN FLIGHT (point 388, fifth live finding 28.07.2026) —
// the IO half. The decision logic is pure in scripts/batch-in-flight-core.mjs;
// this module only reads/writes the marker and runs the probes that PROVE the
// declared work is still running. CLI:
//
//   node scripts/batch-in-flight.mjs --waiting-on "<what>" [--pid N]… [--branch REF]…
//                                    [--worktree PATH]… [--log PATH]…
//   node scripts/batch-in-flight.mjs --status   what the Stop hook would decide
//   node scripts/batch-in-flight.mjs --clear    the wait is over
//   node scripts/batch-in-flight.mjs --agent-check [--worktree PATH] [--branch REF]
//                                    [--log PATH]
//                                    may this delegated agent be REPLACED? Exit 0
//                                    yes, exit 1 no. Run it IMMEDIATELY before
//                                    the respawn (point 434 (5)).
//
// Declaring is DELIBERATE and verified up front, exactly like taking a boundary:
// the command refuses unless this is the batch lock's owner and every piece of
// evidence checks out at the moment it is written, so the session learns at the
// declaration rather than at a blocked turn end.
//
// It does NOT hand the batch over and does NOT touch the lock: a waiting session
// is still the working session, and the launcher must keep seeing a live owner.
// The ONLY thing it changes is that `batch-progress-guard` stops demanding work
// the session cannot do while it waits — and it stops the moment the evidence
// stops checking out, or the declaration ages out.
import { readFileSync, rmSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import {
  readOwnerLock,
  readBoundaryMarker,
  resolveOwnership,
  probePid,
  ourClaudeProcess,
  statePathsFor,
  extendLease,
  clearDeclaredWait,
  LOCK_PATH,
  IN_FLIGHT_PATH,
} from './batch-singleton.mjs'
import { BOUNDARY_FRESH_MS, markerPhase } from './batch-boundary-core.mjs'
import { DECLARED_WAIT_LEASE_MS } from './batch-lease-core.mjs'
import {
  adoptionAssessment,
  agentOutputVerdict,
  assessInFlight,
  assessTransfer,
  checkEvidence,
  combineWorktreeStamps,
  describeInFlight,
  markTransferred,
  porcelainPaths,
  respawnDecision,
  selfReferentialEvidence,
  slotReasonDecision,
  slotsRemedy,
  statusVerdict,
  transferBlockMessage,
  closingFreezeActive,
  declaredAgentCount,
  openPointSpecs,
  waitEtaRefusal,
  IN_FLIGHT_MAX_AGE_MS,
  POOL_CAP,
  RESPAWN_GRACE_MS,
} from './batch-in-flight-core.mjs'
import { readTasksOpen, TASKS_PATH } from './tasks-source.mjs'
import { boardFilePath } from './dashboard-state.mjs'
import { berlinMinutes } from './dashboard-guard.mjs'

export { IN_FLIGHT_PATH }

/** The calibratable maximum age, HOA_IN_FLIGHT_MAX_MIN in minutes. Reading it
 *  here (not in the core) keeps the decision function pure and testable. */
export function maxAgeMs(env = process.env) {
  const raw = Number(env.HOA_IN_FLIGHT_MAX_MIN)
  return Number.isFinite(raw) && raw > 0 ? raw * 60 * 1000 : IN_FLIGHT_MAX_AGE_MS
}

export function readDeclaration(path = IN_FLIGHT_PATH) {
  try {
    const d = JSON.parse(readFileSync(path, 'utf8'))
    return d && typeof d === 'object' ? d : null
  } catch {
    return null
  }
}

export function writeDeclaration(declaration, path = IN_FLIGHT_PATH) {
  writeJsonAtomic(path, declaration)
}

export function clearDeclaration(path = IN_FLIGHT_PATH) {
  try {
    rmSync(path, { force: true })
    return true
  } catch {
    return false
  }
}

// --- The probes ----------------------------------------------------------------

/**
 * WHEN did this branch last receive a commit? Epoch ms, or null when the ref does
 * not resolve. Existence was not enough (four-eyes review): ~94 `feat/*` and
 * `worktree-agent-*` branches live in this repository, so "the branch is there"
 * is true of work that finished days ago. Any git failure answers null — evidence
 * that cannot be established never counts as established. execFile, never a shell
 * (a `^` in a revision is eaten by cmd.exe).
 */
export function refTipAt(ref, { cwd = REPO_ROOT } = {}) {
  const name = String(ref ?? '').trim()
  if (!name || /[\s~^:?*[\]\\]/.test(name)) return null
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', `${name}^{commit}`], {
      windowsHide: true,
      cwd,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const secs = Number(out)
    return Number.isFinite(secs) && secs > 0 ? secs * 1000 : null
  } catch {
    return null
  }
}

const stampOf = (p) => {
  try {
    return statSync(p).mtimeMs
  } catch {
    return null
  }
}

/**
 * WHEN was a WORKING FILE in this checkout last written? Epoch ms, or null when
 * git cannot answer. This is the half the git metadata cannot see: an agent
 * editing source for twenty minutes runs no git command at all.
 *
 * `git status --porcelain -z` names exactly the paths that are dirty or new —
 * cheaper than walking a checkout, and it already respects `.gitignore`, so
 * `node_modules/` and `dist/` never enter. Three flags carry weight:
 *   · `--no-optional-locks` keeps OUR OWN look from becoming the evidence —
 *     without it git may refresh (and rewrite) the index, which is the
 *     contamination point 434 (5b) names. The caller additionally stats the git
 *     metadata BEFORE calling this, so even a git that ignored the flag could not
 *     backdate the other half.
 *   · `--untracked-files=all` is stated rather than assumed, and it is ALL rather
 *     than `normal` for a measured reason (four-eyes review, findings 5 and its
 *     re-check): a global or repo `status.showUntrackedFiles=no` would otherwise
 *     hide exactly the case this probe exists for, and under `-unormal` a wholly
 *     NEW directory collapses to one entry — `?? newmod/` — whose DIRECTORY mtime
 *     does not move when an existing child inside it is edited. An agent that
 *     creates `src/newthing/` and then works inside it for twenty minutes would
 *     read `quiet` all over again. `-uall` names the files themselves.
 *   · `--ignore-submodules=all`, because a submodule's own dirtiness is not this
 *     checkout's work and would cost a recursive status.
 *
 * `limit` bounds the stats, not the newest-wins comparison; `git status` sorts by
 * PATH, so a checkout dirtier than the limit can miss the newest file and fall
 * back to the git metadata. That is the safe direction (it can only under-report
 * freshness), and an agent worktree does not reach it.
 *
 * Any failure answers null — evidence that cannot be established never counts as
 * established, the same rule `refTipAt` follows.
 */
export function worktreeFilesActiveAt(root, { limit } = {}) {
  const dir = String(root ?? '').trim()
  if (!dir) return null
  let out = ''
  try {
    out = execFileSync(
      'git',
      [
        '--no-optional-locks',
        '-C',
        dir,
        'status',
        '--porcelain',
        '-z',
        '--untracked-files=all',
        '--ignore-submodules=all',
      ],
      {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 8 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
  } catch {
    return null
  }
  let newest = null
  for (const rel of porcelainPaths(out, limit ? { limit } : {})) {
    // An untracked DIRECTORY is reported as `dir/`; its own mtime moves when a
    // file is created in it, which is the answer wanted here either way.
    const at = stampOf(resolve(dir, rel))
    if (typeof at === 'number' && (newest === null || at > newest)) newest = at
  }
  return newest
}

/**
 * WHEN did this worktree last MOVE? `{ at, source }`, or null when the path is
 * not a checkout (or is gone).
 *
 * TWO SOURCES, AND THE VERDICT SAYS WHICH ONE ANSWERED (point 434 (5b)):
 *   · GIT METADATA — a worktree's `.git` is a FILE pointing at
 *     `…/.git/worktrees/<name>`; that directory carries the index, HEAD and
 *     COMMIT_EDITMSG a working agent rewrites on every commit. This dates the last
 *     git OPERATION, which is why it alone read a mid-edit agent as `quiet`.
 *   · WORKING FILES — the newest dirty/new path (see `worktreeFilesActiveAt`).
 * The metadata is stat'd FIRST, before anything shells out, so this probe cannot
 * date its own call.
 */
export function worktreeActiveAt(path) {
  const root = String(path ?? '').trim()
  if (!root) return null
  let gitdir = null
  const dot = join(root, '.git')
  try {
    const st = statSync(dot)
    if (st.isDirectory()) gitdir = dot
    else {
      const m = readFileSync(dot, 'utf8').match(/^gitdir:\s*(.+)$/m)
      gitdir = m ? resolve(root, m[1].trim()) : null
    }
  } catch {
    return null // no checkout there any more
  }
  if (!gitdir) return null
  const stamps = [gitdir, join(gitdir, 'index'), join(gitdir, 'HEAD'), join(gitdir, 'COMMIT_EDITMSG')]
    .map(stampOf)
    .filter((v) => typeof v === 'number')
  const gitAt = stamps.length ? Math.max(...stamps) : null
  return combineWorktreeStamps({ gitAt, filesAt: worktreeFilesActiveAt(root) })
}

export function mtimeOf(path) {
  try {
    return statSync(String(path)).mtimeMs
  } catch {
    return null
  }
}

/**
 * THE FULL SYMBOLIC NAME GIT GIVES THIS REF — `refs/heads/main` for `main` and
 * for `heads/main`, `HEAD` for `@`, `refs/remotes/origin/main` for `origin/main`.
 * Null when git cannot resolve it (an unknown ref, a revision expression like
 * `main@{0}` that has no symbolic name, or no git at all).
 *
 * The refusal list can only compare NAMES, and a name has more spellings than any
 * string rule can enumerate: the second four-eyes review (28.07.2026, finding B)
 * declared `--branch @` and `--branch heads/main` live and both sailed past it,
 * then probed eternally fresh. Git is the only authority on what a ref names, so
 * the declared ref is resolved through it and the RESOLVED name is what gets
 * refused and stored. An unresolvable ref falls back to what was typed, where the
 * string rules in `normRef` still apply and the up-front evidence check then fails
 * it as a branch that does not exist.
 */
export function resolveRefName(ref, { cwd = REPO_ROOT } = {}) {
  const name = String(ref ?? '').trim()
  // Never hand git something it would read as an option (`--help` opens a pager).
  if (!name || name.startsWith('-') || /[\s~^:?*[\]\\]/.test(name)) return null
  try {
    const out = execFileSync('git', ['rev-parse', '--symbolic-full-name', name], {
      windowsHide: true,
      cwd,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out || null
  } catch {
    return null
  }
}

/** The branch this checkout has checked out, or null when it cannot be read (a
 *  detached HEAD, or no git at all). Only used to REFUSE naming it as evidence,
 *  so an unreadable answer refuses nothing extra. */
/** An absolute path for what was typed. An empty value stays empty, so it keeps
 *  failing as "no path" instead of quietly becoming the working directory. */
export function absPath(value) {
  const raw = String(value ?? '').trim()
  return raw ? resolve(raw) : raw
}

export function currentBranchOf({ cwd = REPO_ROOT } = {}) {
  try {
    const out = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      windowsHide: true,
      cwd,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out && out !== 'HEAD' ? out : null
  } catch {
    return null
  }
}

// The FULL probe, not the cheap one: `cheapProbePid` answers existence only (and
// true on EPERM), so a reused pid would keep a declaration alive on a stranger's
// process. The start time is what makes a pid an identity.
const probes = { probePid, refTipAt, worktreeActiveAt, mtimeOf }

/**
 * Everything the Stop hook needs, gathered. Returns the core's assessment plus
 * the declaration it judged. Cheap in the common case: with no marker on disk it
 * returns before any probe runs, so an ordinary turn end pays nothing for this.
 */
/** The path whose existence DECLARES a CLOSING FREEZE (CLAUDE.md §9) by hand: while a
 *  closing run is under way no agent work may land, so empty pool slots are correct.
 *  It is the override, not the primary signal — see `closingFreeze()`. */
export const CLOSING_FREEZE_PATH = resolve(REPO_ROOT, '.claude', 'closing-freeze')
/** Where `closing-guard` keeps its per-commit checklist. THIS is the signal a closing
 *  is really running, because it is written as a side effect of doing the closing. */
export const CLOSING_STATE_PATH = resolve(REPO_ROOT, '.claude', 'closing-state.json')
const PAUSE_PATH = resolve(REPO_ROOT, '.claude', 'batch-paused')

/**
 * IS A CLOSING FREEZE UNDER WAY? The decision is pure (`closingFreezeActive`); this
 * reads the two facts it needs. A hand-placed marker file counts, and so does a
 * closing checklist recorded for the CURRENT HEAD — the latter is what makes the
 * recognition reachable at all, since nothing in this repository ever writes the
 * marker. Unreadable either way answers "no freeze", the direction that keeps the
 * nudge alive rather than silencing it on a failed read.
 */
export function closingFreeze({ cwd = REPO_ROOT, statePath = CLOSING_STATE_PATH } = {}) {
  let closingState = null
  try {
    closingState = JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    /* no closing has ever been recorded here */
  }
  let head = ''
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], {
      windowsHide: true,
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    /* not a repo — then the state cannot be keyed to this HEAD either */
  }
  return closingFreezeActive({ marker: existsSync(CLOSING_FREEZE_PATH), closingState, head })
}

/** The branch checked out in a declared WORKTREE, or null.
 *
 *  Without this the whole slot check would go dark in the commonest shape there is:
 *  an agent declared with `--worktree` alone names no ref, `runningBranchFiles` came
 *  back empty, and an empty running-file set is deliberately read as "the overlap
 *  question cannot be answered" — no demand, ever. The worktree KNOWS its branch, so
 *  it is asked. */
export function worktreeBranch(path, { cwd = REPO_ROOT } = {}) {
  try {
    const ref = execFileSync('git', ['-C', String(path), 'symbolic-ref', '--quiet', 'HEAD'], {
      windowsHide: true,
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return ref || null
  } catch {
    return null // detached HEAD, gone worktree, not a repo
  }
}

/** The files the running agent branches touch, against `main`. Best effort: an
 *  unreadable git yields an EMPTY set, and an empty running set can only make more
 *  points look independent — so the fallback is checked at the decision, where an
 *  unknown state must never produce a demand. */
export function runningBranchFiles(evidence = [], { cwd = REPO_ROOT } = {}) {
  const refs = new Set()
  for (const e of evidence ?? []) {
    if (e?.kind === 'branch' && e.ref) refs.add(String(e.ref))
    // A worktree is evidence of a branch too — see `worktreeBranch`.
    if (e?.kind === 'worktree' && e.path) {
      const ref = worktreeBranch(e.path, { cwd })
      if (ref) refs.add(ref)
    }
  }
  const files = new Set()
  for (const ref of refs) {
    try {
      const out = execFileSync('git', ['diff', '--name-only', `main...${ref}`], {
        windowsHide: true,
        cwd,
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      for (const line of out.split(/\r?\n/)) if (line.trim()) files.add(line.trim())
    } catch {
      /* unknown ref / not a repo — this branch contributes nothing */
    }
  }
  return [...files]
}

/**
 * DOES THIS WAIT OWE A REASON FOR ITS IDLE POOL SLOTS (point 427)? The decision is
 * pure (`slotReasonDecision`); this gathers the four facts. Anything unreadable ends
 * as "no demand" — the lower bound on the pool is worth a nudge, never a wedge.
 */
export function gatherSlots(declaration, { cwd = REPO_ROOT, tasksPath = TASKS_PATH } = {}) {
  try {
    const evidence = Array.isArray(declaration?.evidence) ? declaration.evidence : []
    const running = runningBranchFiles(evidence, { cwd })
    // No readable running-file set means the overlap question cannot be answered, and
    // an unanswerable question is not a reason to demand anything.
    if (running.length === 0) return { needsReason: false, slotsFree: 0, agents: 0, candidates: [], why: 'overlap-unknown' }
    return slotReasonDecision({
      agents: declaredAgentCount(evidence),
      openPoints: openPointSpecs(readTasksOpen(tasksPath)),
      runningFiles: running,
      reason: declaration?.slotsFree ?? '',
      paused: existsSync(PAUSE_PATH),
      closingFreeze: closingFreeze({ cwd }).active,
      cap: POOL_CAP,
    })
  } catch {
    return { needsReason: false, slotsFree: 0, agents: 0, candidates: [], why: 'ungatherable' }
  }
}

export function gatherInFlight(sid, { now = Date.now(), lockPath = LOCK_PATH, env = process.env } = {}) {
  const path = statePathsFor(lockPath).inFlightPath
  const declaration = readDeclaration(path)
  if (!declaration) {
    return { declaration: null, live: false, reason: 'no-declaration', summary: '', items: [], slots: null }
  }
  // The ancestor walk is only needed when the session id no longer matches (a
  // context compaction) — it is the expensive probe, so it stays behind that.
  const ancestor = declaration.sessionId === sid ? null : ourClaudeProcess(sid, { lockPath })
  const assessment = assessInFlight({
    declaration,
    sid,
    ancestor,
    now,
    maxAgeMs: maxAgeMs(env),
    ...probes,
  })
  // Only worth asking for a wait that would otherwise be allowed: a declaration that
  // is not live blocks anyway, and paying two git calls to explain a block nobody is
  // getting would be waste on the Stop hook's path.
  const slots = assessment.live ? gatherSlots(declaration) : null
  return { declaration, ...assessment, slots }
}

/**
 * MAY A DELEGATED AGENT BE REPLACED (point 434 (5))? The decision is pure
 * (`agentOutputVerdict` + `respawnDecision`); this only runs the same three
 * probes the declaration uses, so "is it still working" is answered from ONE
 * body of evidence rather than from two that can disagree.
 *
 * It is deliberately cheap and side-effect free, because its whole value lies in
 * being run AGAIN in the seconds before the spawn: on 30.07.2026 the branch tip
 * moved one minute before the replacement was started.
 */
export function checkAgentOutput({ worktree = null, branch = null, log = null, now = Date.now(), graceMs } = {}) {
  const output = agentOutputVerdict({
    worktreeAt: worktree ? worktreeActiveAt(worktree) : null,
    branchTipAt: branch ? refTipAt(branch) : null,
    logAt: log ? mtimeOf(log) : null,
    now,
    ...(Number.isFinite(graceMs) && graceMs > 0 ? { graceMs } : {}),
  })
  return { output, ...respawnDecision({ output }) }
}

// --- The transferable adoption record (point 675, defeat 2) ---------------------

/** Local and remote-tracking tip of a branch: { ref, localSha, remoteSha }, or
 *  null for an unusable name. `origin/<branch>` is the honest reading of
 *  "committed AND PUSHED" without a network round trip: a worktree push updates
 *  it in the shared git dir, and a branch never pushed simply has none. */
export function checkpointOf(ref, { cwd = REPO_ROOT } = {}) {
  const name = String(ref ?? '')
    .trim()
    .replace(/^refs\/heads\//, '')
  if (!name || name.startsWith('-') || /[\s~^:?*[\]\\]/.test(name)) return null
  const sha = (rev) => {
    try {
      return (
        execFileSync('git', ['rev-parse', `${rev}^{commit}`], {
          windowsHide: true,
          cwd,
          encoding: 'utf8',
          timeout: 8000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || null
      )
    } catch {
      return null
    }
  }
  return { ref: name, localSha: sha(`refs/heads/${name}`) ?? sha(name), remoteSha: sha(`refs/remotes/origin/${name}`) }
}

/** Is `ancestorSha` contained in `sha`? Used at adoption: a branch that moved
 *  FORWARD from its recorded checkpoint is still the handed-over work. */
export function isAncestor(ancestorSha, sha, { cwd = REPO_ROOT } = {}) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', String(ancestorSha), String(sha)], {
      windowsHide: true,
      cwd,
      timeout: 8000,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

/** The declaration's evidence, annotated with checkpoints for `assessTransfer`. */
export function transferItems(declaration, { cwd = REPO_ROOT } = {}) {
  const out = []
  for (const e of Array.isArray(declaration?.evidence) ? declaration.evidence : []) {
    if (e?.kind === 'branch') {
      out.push({ kind: 'branch', describe: `branch ${e.ref}`, checkpoint: checkpointOf(e.ref, { cwd }) })
    } else if (e?.kind === 'worktree') {
      const ref = worktreeBranch(e.path, { cwd })
      out.push({
        kind: 'worktree',
        describe: `worktree ${e.path}`,
        checkpoint: ref ? checkpointOf(ref, { cwd }) : null,
      })
    } else {
      out.push({ kind: String(e?.kind ?? ''), describe: `${e?.kind ?? '?'} ${e?.pid ?? e?.path ?? ''}`.trim(), checkpoint: null })
    }
  }
  return out
}

/**
 * MAY THE BOUNDARY HAND THIS SESSION'S IN-FLIGHT WORK TO A SUCCESSOR (point 675,
 * defeat 2)? Judged at `--prepare` AND at `--commit`. Returns
 * { blocked, message?, note, commit? } — `commit()` marks the declaration
 * TRANSFERRED and returns the checkpoint summary; it exists only when nothing
 * blocks. Fail direction: an unreadable declaration blocks nothing (it is the
 * guard's ordinary business), but a READABLE one with unverifiable checkpoints
 * blocks — a successor cannot adopt what cannot be verified.
 */
export function gatherHandoverTransfer(sid, { cwd = REPO_ROOT, lockPath = LOCK_PATH, now = Date.now() } = {}) {
  const path = statePathsFor(lockPath).inFlightPath
  const declaration = readDeclaration(path)
  if (!declaration) return { blocked: false, note: '', commit: null }
  const summarise = (checkpoints) =>
    (checkpoints ?? []).map((c) => `${c.ref ?? '?'}@${String(c.sha).slice(0, 8)}`).join(', ') || 'no checkpoints'
  // IDEMPOTENT (Sol review of 807c2bf, finding 6): a declaration already
  // transferred and not yet adopted is not re-judged and not re-transferred —
  // the record awaiting adoption IS the handover's state, and `commit` only
  // repeats its summary.
  if (declaration.transfer && !declaration.adopted) {
    return {
      blocked: false,
      note: `a transferred declaration already awaits adoption (${summarise(declaration.transfer.checkpoints)})`,
      commit: () => summarise(declaration.transfer.checkpoints),
    }
  }
  // SESSION-BOUND (same finding): a declaration this owner cannot be resolved
  // to is not its to transfer — and it must not BLOCK this owner's handover
  // either. It is left untouched and named; the successor's --adopt refuses
  // an untransferred record, so nothing is silently inherited.
  const lock = readOwnerLock(lockPath)
  const owner = resolveOwnership({
    lock: declaration,
    sessionId: sid,
    ancestor:
      lock && typeof lock.pid === 'number' && lock.pid > 0
        ? { pid: lock.pid, startedAt: lock.pidStartedAt ?? null }
        : null,
  })
  if (!owner.mine) {
    return {
      blocked: false,
      note: `a foreign in-flight declaration (session ${declaration.sessionId ?? '?'}) was left untouched — not this session's to transfer`,
      commit: null,
    }
  }
  const assessment = assessTransfer({ items: transferItems(declaration, { cwd }) })
  if (!assessment.transferable) {
    return { blocked: true, message: transferBlockMessage(assessment), note: '', commit: null }
  }
  const summary =
    assessment.checkpoints.map((c) => `${c.ref ?? '?'}@${String(c.sha).slice(0, 8)}`).join(', ') || 'no checkpoints'
  return {
    blocked: false,
    note: `the declared in-flight work is transferable (pushed checkpoints: ${summary})`,
    commit: () => {
      writeDeclaration(markTransferred({ declaration, bySid: sid, now, checkpoints: assessment.checkpoints }), path)
      return summary
    },
  }
}

/**
 * THE SUCCESSOR ADOPTS a transferred declaration (M4/M7): evidence is re-probed,
 * what expired is DROPPED AND NAMED, a contradicted or empty record REFUSES with
 * its alerts — never a silent unblock. On success the declaration is rewritten
 * under the adopting session's own identity, so every existing probe
 * (`gatherInFlight`, the launcher) keeps working on it unchanged.
 */
export function adoptTransferred(sid, { cwd = REPO_ROOT, lockPath = LOCK_PATH, now = Date.now() } = {}) {
  const path = statePathsFor(lockPath).inFlightPath
  const declaration = readDeclaration(path)
  if (!declaration || !declaration.transfer) return { adopted: false, reason: 'no-transferred-declaration', alerts: [] }
  const evidence = Array.isArray(declaration.evidence) ? declaration.evidence : []
  const items = evidence.map((e) => checkEvidence(e, { now, ...probes }))
  const checkpointStates = (declaration.transfer.checkpoints ?? []).map((c) => {
    const cp = c?.ref ? checkpointOf(c.ref, { cwd }) : null
    return {
      ref: c?.ref ?? null,
      recordedSha: c?.sha,
      localSha: cp?.localSha ?? null,
      ancestor: cp?.localSha && c?.sha ? isAncestor(c.sha, cp.localSha, { cwd }) : false,
    }
  })
  const assessment = adoptionAssessment({ items, checkpointStates })
  if (!assessment.adopt) return { adopted: false, reason: 'refused', alerts: assessment.alerts }
  const lock = readOwnerLock(lockPath)
  writeDeclaration(
    {
      ...declaration,
      sessionId: sid,
      pid: typeof lock?.pid === 'number' ? lock.pid : null,
      pidStartedAt: typeof lock?.pidStartedAt === 'number' ? lock.pidStartedAt : null,
      at: now,
      evidence: evidence.filter((_, i) => items[i]?.ok === true),
      adopted: { from: declaration.transfer.by || declaration.sessionId || null, at: now },
    },
    path,
  )
  return {
    adopted: true,
    reason: 'adopted',
    alerts: assessment.alerts,
    kept: assessment.kept.length,
    dropped: assessment.dropped.length,
  }
}

/**
 * MAY THIS DECLARATION BE MUTATED AT ALL (Sol review of 807c2bf, finding 4)?
 * `batch-in-flight` sits in the CLOSING SET, so the sealed-boundary deny never
 * fires on it — but a TRANSFERRED, un-adopted declaration under a live
 * committed marker is the SUCCESSOR'S adoption record, and `--clear` or a fresh
 * `--waiting-on` would strand the very work the handover promised. Injectable
 * and pure over its inputs, so the Vitest layer pins it. Null = mutation
 * allowed; otherwise the refusal message.
 */
export function transferredMutationRefusal({ declaration, marker, now = Date.now() } = {}) {
  if (!declaration || !declaration.transfer || declaration.adopted) return null
  if (markerPhase(marker) !== 'committed') return null
  if (!(typeof marker.at === 'number' && now - marker.at < BOUNDARY_FRESH_MS)) return null
  return (
    'THE DECLARATION IS TRANSFERRED under a committed boundary — it is the successor\'s adoption record now, ' +
    'so clearing or overwriting it here would strand the work the handover promised. The successor takes it ' +
    'with `node scripts/batch-in-flight.mjs --adopt`. If this session genuinely resumes work, withdraw the ' +
    'boundary FIRST (`node scripts/batch-boundary.mjs --clear`) — then the declaration is yours again. ' +
    'Nothing changed.'
  )
}

// --- CLI -----------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (isMain) {
  const argv = process.argv.slice(2)
  const sid = readOwnerLock()?.sessionId ?? ''
  const fail = (msg) => {
    console.error(msg)
    process.exit(1)
  }
  const usage =
    'usage: node scripts/batch-in-flight.mjs --waiting-on "<what>" [--pid N] [--branch REF] ' +
    '[--worktree PATH] [--log PATH] [--slots-free "<why the free pool slots stay free>"] | --status | --clear | ' +
    '--agent-check [--worktree PATH] [--branch REF] [--log PATH] | --handover-check | --adopt'

  if (argv[0] === '--handover-check') {
    // May the boundary hand the declared work to a successor (point 675)?
    // Read-only twin of what `batch-boundary.mjs --prepare/--commit` enforces.
    const t = gatherHandoverTransfer(sid)
    if (t.blocked) {
      console.error(t.message)
      process.exit(1)
    }
    console.log(
      t.note
        ? `TRANSFERABLE — ${t.note}. A boundary commit will mark it transferred; the successor adopts it ` +
            'with `node scripts/batch-in-flight.mjs --adopt`.'
        : 'nothing is declared in flight — the handover is unconstrained.',
    )
    process.exit(0)
  } else if (argv[0] === '--adopt') {
    if (!sid) fail('no batch lock owner — only the session that owns the batch lock may adopt. Nothing adopted.')
    const a = adoptTransferred(sid)
    for (const alert of a.alerts) console.error(`ALERT: ${alert}`)
    if (!a.adopted) {
      fail(
        a.reason === 'no-transferred-declaration'
          ? 'no transferred declaration exists — nothing to adopt.'
          : 'ADOPTION REFUSED — the transferred declaration no longer describes live, verifiable work (see the ' +
              'alerts above). Do NOT treat this as a green light: LOOK at each named worktree/branch yourself, ' +
              'then either re-declare what is really running (`--waiting-on …`) or, if the work is finished or ' +
              'gone, act on it and `--clear`.',
      )
    }
    console.log(
      `ADOPTED the transferred declaration (${a.kept} evidence item(s) kept, ${a.dropped} dropped and named ` +
        'above). This session now waits on that work under the ordinary rules: act the moment it lands, ' +
        're-declare or --clear as it changes.',
    )
    process.exit(0)
  } else if (argv[0] === '--agent-check') {
    const opt = (name) => {
      const i = argv.indexOf(name)
      return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null
    }
    const worktree = opt('--worktree')
    const branch = opt('--branch')
    const log = opt('--log')
    if (!worktree && !branch && !log) {
      fail(
        'nothing to check. Name what the agent PRODUCES — its worktree (--worktree PATH) and/or its branch ' +
          `(--branch REF); --log PATH may ride along but never decides.\n${usage}`,
      )
    }
    const r = checkAgentOutput({ worktree, branch, log })
    console.log(JSON.stringify({ worktree, branch, log, graceMs: RESPAWN_GRACE_MS, ...r }, null, 2))
    if (r.respawn) {
      console.log(
        `\nA REPLACEMENT IS PERMITTED: ${r.detail} (judged on ${r.judgedOn}). Re-run this exact command in the ` +
          'seconds before you spawn — an agent that commits in between must not be shot by a stale reading.',
      )
      process.exit(0)
    }
    console.log(
      r.reason === 'agent-alive'
        ? `\nDO NOT REPLACE THIS AGENT: ${r.detail} (judged on ${r.judgedOn}). It is working. On 30.07.2026 an ` +
            'agent was declared dead after 59 silent LOG minutes while its worktree had committed four minutes ' +
            'earlier, and the successor rebuilt two finished points.'
        : `\nDO NOT REPLACE THIS AGENT YET: ${r.detail}. Its OUTPUT could not be measured, and silence is not ` +
            'evidence of death — find the worktree or the branch and ask again, or look at the agent itself.',
    )
    process.exit(1)
  } else if (argv[0] === '--clear') {
    const refusal = transferredMutationRefusal({ declaration: readDeclaration(), marker: readBoundaryMarker() })
    if (refusal) fail(refusal)
    clearDeclaration()
    // …and the lease extension the declaration bought (point 556). The lock must
    // not go on carrying a `declaredWait` whose declaration is gone: the marker is
    // what makes the window conditional, and a conditional window with nothing left
    // to condition it on is just a stale field. The lease ITSELF is left where it
    // stands — pulling it back would shorten a window the owner is entitled to.
    clearDeclaredWait(sid)
    console.log('in-flight declaration cleared — the ordinary "do not stop the batch" rule applies again.')
  } else if (argv[0] === '--status' || argv.length === 0) {
    const g = gatherInFlight(sid)
    console.log(JSON.stringify({ ownerSessionId: sid || null, maxAgeMs: maxAgeMs(), ...g }, null, 2))
    // The verdict is decided in the pure core, not by an `if` here: since point 427
    // a declaration can be perfectly live and STILL block, and this command promises
    // what the hook would decide.
    const verdict = statusVerdict(g)
    if (verdict.verdict === 'none') console.log(`\nNothing declared.\n${usage}`)
    else if (verdict.verdict === 'allowed') {
      console.log(`\nA stop would be ALLOWED — waiting on ${describeInFlight(g, g.declaration)}`)
    } else if (verdict.why === 'slots-free') {
      console.log(
        `\nA stop would be BLOCKED. The wait itself checks out (${describeInFlight(g, g.declaration)}), but the ` +
          `agent pool runs below its cap and nothing says why.\n\n${slotsRemedy({ slots: g.slots ?? {}, cap: POOL_CAP })}`,
      )
    } else console.log(`\nA stop would be BLOCKED (${verdict.why}).`)
  } else if (argv[0] === '--waiting-on') {
    const waitingOn = String(argv[1] ?? '').trim()
    if (!waitingOn) fail(`--waiting-on needs a description of the wait.\n${usage}`)
    const transferRefusal = transferredMutationRefusal({
      declaration: readDeclaration(),
      marker: readBoundaryMarker(),
    })
    if (transferRefusal) fail(transferRefusal)
    const evidence = []
    let slotsFreeReason = ''
    for (let i = 2; i < argv.length; i += 2) {
      const flag = argv[i]
      const value = argv[i + 1]
      if (value === undefined) fail(`${flag} needs a value.\n${usage}`)
      if (flag === '--slots-free') {
        // Point 427: not evidence, a REASON. It answers "why do the free pool slots
        // stay free", and the guard demands it only when they demonstrably could not.
        slotsFreeReason = String(value).trim()
        if (!slotsFreeReason) fail(`--slots-free needs a reason for the idle pool slots.\n${usage}`)
        continue
      }
      if (flag === '--pid') {
        // The start time is recorded WITH the pid, so a later probe can tell the
        // same process from a stranger that inherited the number.
        const pid = Number(value)
        const probe = Number.isInteger(pid) && pid > 0 ? probePid(pid) : { exists: false, startedAt: null }
        if (probe.exists === true && typeof probe.startedAt !== 'number') {
          fail(
            `the start time of pid ${pid} could not be established, so a reused pid could later pass as this ` +
              'process. Declare something else instead (--log <the file the run writes to> is the closest ' +
              'equivalent). Nothing recorded.',
          )
        }
        evidence.push({ kind: 'pid', pid, startedAt: probe.startedAt })
      }
      // WHAT IS STORED IS WHAT THE LAUNCHER WILL PROBE (second four-eyes review,
      // 28.07.2026, finding B). Both of the following used to be recorded raw:
      //   - a REF, so `@`, `heads/main` and `main@{0}` — every one of them a
      //     spelling of something eternally fresh — walked past the refusal below
      //     and then answered "still moving" forever. Git resolves it, git's
      //     answer is what gets refused, and git's answer is what gets stored.
      //   - a PATH, which `normPath` only cleans up and never RESOLVES, so
      //     `--worktree .` from the repo root, `<root>/.` and `<root>/../hoa` all
      //     named the checkout itself without being recognised as it. And a
      //     relative path is meaningless to the launcher anyway: it probes from
      //     its own cwd, not from the one the declaration was written in.
      else if (flag === '--branch') evidence.push({ kind: 'branch', ref: resolveRefName(value) ?? value })
      else if (flag === '--worktree') evidence.push({ kind: 'worktree', path: absPath(value) })
      else if (flag === '--log') evidence.push({ kind: 'log', path: absPath(value) })
      else fail(`unknown option "${flag}".\n${usage}`)
    }
    // Evidence that cannot go quiet is refused HERE (four-eyes review
    // 28.07.2026): the repo root is git-active whenever the session runs any git
    // command, and `main` / this checkout's own branch move on work that is not
    // the work being waited for. Such a declaration would hold indefinitely AND
    // silence the launcher's silent-owner report, leaving the session less
    // observed than declaring nothing.
    const selfReferential = selfReferentialEvidence({
      evidence,
      repoRoot: REPO_ROOT,
      currentBranch: currentBranchOf(),
    })
    if (selfReferential.length > 0) {
      fail(
        'this evidence cannot go quiet, so it proves nothing:\n' +
          selfReferential.map((p) => `  --${p.kind} ${p.value} — ${p.why}`).join('\n') +
          '\nName what the DELEGATED work touches instead: the agent\'s own feat/… branch, its own worktree ' +
          'path, the pid of the background run, or the log file that run writes to. Nothing recorded.',
      )
    }
    if (evidence.length === 0) {
      fail(
        'no EVIDENCE given. A declaration is only honoured while a probe can confirm the work is still ' +
          'RUNNING — not merely that it once existed — so it must name at least one of: --pid <background ' +
          'process, alive and the same process>, --branch <agent branch, committed to recently>, --worktree ' +
          `<agent worktree, git-active recently>, --log <file the run is still writing to>.\n${usage}`,
      )
    }
    const lock = readOwnerLock()
    if (!sid || !lock) {
      fail(
        'no batch lock owner — only the session that owns .claude/batch-lock.json waits on behalf of the ' +
          'batch. Nothing recorded.',
      )
    }
    const now = Date.now()
    const declaration = {
      v: 1,
      sessionId: sid,
      // The lock's process identity, so a context compaction that mints a new
      // session id does not orphan the declaration (resolveOwnership, point 388).
      pid: typeof lock.pid === 'number' ? lock.pid : null,
      pidStartedAt: typeof lock.pidStartedAt === 'number' ? lock.pidStartedAt : null,
      at: now,
      waitingOn,
      evidence,
      // Empty string when not given, so the decision sees "no reason" rather than
      // an absent field it has to interpret (point 427).
      slotsFree: slotsFreeReason,
    }
    // Verify NOW, so a typo is caught here and not at a turn end that then blocks
    // with a reason nobody expected.
    const check = assessInFlight({ declaration, sid, now, maxAgeMs: maxAgeMs(), ...probes })
    if (!check.live) {
      fail(
        `the evidence does not check out (${check.reason}): ${check.summary || 'nothing verifiable'}. ` +
          'Nothing recorded — a declaration is only worth as much as what proves it.',
      )
    }
    // THE CAP IS ALSO A TARGET (point 427). Refused HERE as well as at the turn end,
    // so the session learns at the declaration rather than at a blocked stop — the
    // same discipline the evidence check above follows.
    const slots = gatherSlots(declaration)
    if (slots.needsReason) fail(`${slotsRemedy({ slots, cap: POOL_CAP })}\nNothing recorded.`)
    // THE BOARD'S PROMISE MUST NOT AGE UNDER THIS WAIT (point 661): a wait is
    // this session's licence to produce no turn end for up to an hour, so the
    // `now-eta-past` audit would sleep exactly that long. Refuse the wait while
    // a current-work "~HH:MM" already lies in the past — every re-declaration
    // then bounds the staleness. FAIL-OPEN on an unreadable or absent board
    // (html null → no refusal): a broken board must not trap the session.
    const boardHtml = (() => {
      try {
        return readFileSync(boardFilePath(), 'utf8')
      } catch {
        return null
      }
    })()
    const etaRefusal = waitEtaRefusal({ html: boardHtml, nowMinutes: berlinMinutes() })
    if (etaRefusal) fail(etaRefusal)
    writeDeclaration(declaration)
    // THE DECLARATION EXTENDS THE LEASE (point 556, and the piece
    // docs/batch-resilience.md §3 left explicitly unbuilt: "nothing yet WRITES a
    // longer lease when work is declared"). This is the answer to the incident of
    // 08.08.2026: the house rule tells a session waiting on an agent or a long
    // verification to stay inside ONE long-blocking call, and from in there it can
    // renew nothing — its own lease ages to expiry precisely while it is most
    // productive. A renewal at call start cannot fix that, because it buys one
    // window whatever it does; only saying IN ADVANCE that the wait will be long
    // can. It is honest, not a blank cheque: the extension records itself on the
    // lock, and the launcher ends it early the moment this declaration's own
    // evidence stops advancing (`declaredWaitStale`).
    const leaseHours = Math.round(DECLARED_WAIT_LEASE_MS / 3600_000)
    const extended = extendLease(sid, now + DECLARED_WAIT_LEASE_MS, { declaredWait: true, now })
    const mins = Math.round(maxAgeMs() / 60000)
    console.log(
      extended
        ? `the batch lease is extended to cover this wait (${leaseHours} h), so one blocking call may run past ` +
            'the ordinary window without the launcher taking the batch. The extension lasts exactly as long as ' +
            'the evidence below keeps advancing.'
        : 'NOTE: the batch lease could NOT be extended for this wait — a blocking call longer than the ordinary ' +
            'window may lose the batch. Check `node scripts/batch-doctor.mjs`.',
    )
    console.log(
      `waiting on ${waitingOn} — recorded: ${check.summary}. The turn may now end while this holds. It ` +
        `expires in ${mins} min and stops holding the MOMENT any of it stops checking out (a dead or replaced ` +
        'process, a branch or worktree that has gone quiet, a silent log — none of them may merely EXIST, all ' +
        'must still be moving), so re-declare after every change and clear it with --clear when the ' +
        'wait is over. The batch lock stays HELD: no successor is spawned, this session is still the batch.',
    )
  } else {
    fail(`unknown option "${argv[0]}".\n${usage}`)
  }
}
