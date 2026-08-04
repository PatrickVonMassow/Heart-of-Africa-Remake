// Decision logic for the batch doctor (scripts/batch-doctor.mjs): after a
// parallel-session incident the OWNER must prove the repo was not corrupted by
// concurrent writes — and if it was, prefer THROWING AWAY suspect work
// (recoverably: rescue branch + stash, everything logged) over leaving a
// corrupted tree. Pure and Vitest-covered (scripts/batch-doctor-core.test.mjs);
// the wrapper gathers the git state and executes the plan.

/**
 * Plan the remediation for the observed repo state.
 * state = {
 *   branch,                 // current branch of the main checkout
 *   mergeInProgress,        // MERGE_HEAD exists (half-done merge)
 *   dirtyFiles: [..],       // uncommitted paths (porcelain)
 *   conflictMarkers,        // tracked files contain <<<<<<< markers
 *   divergence: { ahead, behind },  // main vs origin/main
 *   tasksParses,            // TASKS.md checkbox format parses
 *   parallelDetected,       // a parallel session was live during the window
 *
 *   THE TORN STATES A KILL LEAVES BEHIND (point 443) — every one of them
 *   OPTIONAL, so a caller that does not gather them plans exactly what it
 *   planned before:
 *   staleGitLocks: [{ path, ageMs }],        // (a) killed commit/push leftovers
 *   worktrees: { pruneNeeded, orphanDirs },  // (b) half-registered / unknown on disk
 *   strayProcesses: [{ pid, kind, cmd }],    // (c) an aborted verification's leftovers
 *   tasksRecoverable,                        // (d) HEAD holds a parseable TASKS.md
 *   stalePendingSpawn: { sessionId, ageMs }, // (e) a pending-spawn lock nobody converted
 *   boardBehind: { reason },                 // (f) local board newer than the published page
 *   ownerAlive,                              // a live owner forbids the process sweep
 * }
 * Returns an ordered list of actions:
 *   { action, level: 'auto' | 'repair' | 'alert', reason, targets? }
 * 'auto'   — safe, run on every doctor invocation
 * 'repair' — destructive-looking (still fully recoverable), runs only with --repair
 * 'alert'  — cannot be fixed mechanically; report loudly
 */
export function planRemediation(state) {
  const plan = []
  const div = state.divergence ?? { ahead: 0, behind: 0 }

  // (a) FIRST, ALWAYS. A stale `index.lock` refuses every write git is asked for
  // below — the abort, the stash, the reset — so clearing it is not one repair
  // among several but the precondition of the rest of this plan.
  const locks = state.staleGitLocks ?? []
  if (locks.length > 0) {
    plan.push({
      action: 'clear-stale-git-locks',
      level: 'repair',
      targets: locks.map((l) => l.path),
      reason:
        `${locks.length} stale git lock file(s) survive a killed commit or push (${locks.map((l) => l.path).join(', ')}). ` +
        'No git process can be holding them any more, and while they lie there every write git is asked for is refused.',
    })
  }

  if (state.mergeInProgress) {
    plan.push({
      action: 'abort-merge',
      level: 'repair',
      reason: 'A merge is half done (MERGE_HEAD exists) — a concurrent session likely interrupted it. Abort restores the pre-merge state.',
    })
  }

  if ((state.dirtyFiles?.length ?? 0) > 0 && (state.parallelDetected || state.conflictMarkers)) {
    plan.push({
      action: 'quarantine-stash',
      level: 'repair',
      reason:
        'Uncommitted changes exist in the shared tree during/after a parallel-session window — they cannot be attributed to one author. Quarantine them in a stash (recoverable, named, logged) rather than build on them.',
    })
  }

  if (div.ahead > 0 && div.behind > 0) {
    plan.push({
      action: 'rescue-and-reset',
      level: 'repair',
      reason:
        'Local main and origin/main DIVERGED — the two-session signature. Preserve local main on a rescue/ branch, then hard-reset main to origin/main (the published, known-good lineage). Nothing is lost; the rescue branch is named in the log.',
    })
  } else if (div.behind > 0 && div.ahead === 0) {
    plan.push({
      action: 'fast-forward',
      level: 'auto',
      reason: 'Local main is strictly behind origin/main — fast-forward to the published state.',
    })
  }
  // ahead-only is the NORMAL owner state (unpushed commits) — no action.

  // (d) A TRUNCATED WORK ORDER IS VERSIONED, so it is repairable rather than
  // merely reportable. The alert stays for the case that is genuinely beyond a
  // mechanism — HEAD's own copy does not parse either, i.e. the damage was
  // committed — because restoring one broken file over another is not a repair.
  if (!state.tasksParses) {
    plan.push(
      state.tasksRecoverable
        ? {
            action: 'restore-tasks-from-head',
            level: 'repair',
            reason:
              'TASKS.md no longer parses, but HEAD carries a parseable copy — a kill during a write truncated the working file. ' +
              'Restore it from HEAD; the damaged bytes are kept aside first, so nothing is thrown away unseen.',
          }
        : {
            action: 'alert-tasks-format',
            level: 'alert',
            reason:
              'TASKS.md checkboxes no longer parse and HEAD holds no parseable copy either — a concurrent edit may have mangled ' +
              'the work order and the damage is committed. Fix by hand; never read this as "batch complete".',
          },
    )
  }

  if (state.conflictMarkers) {
    plan.push({
      action: 'alert-conflict-markers',
      level: 'alert',
      reason: 'Tracked files contain conflict markers (<<<<<<<) — a conflicted merge was committed or left unresolved. Inspect and fix by hand.',
    })
  }

  // (b) Worktrees, in two halves. `git worktree prune` is bookkeeping and safe
  // enough to run unconditionally; a DIRECTORY git no longer lists is a real
  // deletion and stays repair-gated. Six were lying around on 30.07.2026, four
  // of them from the previous night.
  const wt = state.worktrees ?? {}
  if (wt.pruneNeeded) {
    plan.push({
      action: 'prune-worktrees',
      level: 'auto',
      reason: "git still administers worktree(s) whose directory is gone — `git worktree prune` clears the record (bookkeeping, nothing on disk is touched).",
    })
  }
  const orphans = wt.orphanDirs ?? []
  if (orphans.length > 0) {
    plan.push({
      action: 'remove-orphan-worktrees',
      level: 'repair',
      targets: orphans,
      reason:
        `${orphans.length} worktree director(y/ies) under .claude/worktrees/ that git no longer knows (${orphans.join(', ')}). ` +
        'A half-finished removal leaves exactly these; they are removed through scripts/worktree-cleanup.mjs, which detaches ' +
        'the node_modules junction first so the MAIN tree keeps its dependencies.',
    })
  }

  // (c) An aborted verification leaves a headless browser and a dev server
  // running, and they eat CPU for the rest of an unattended fortnight. Matched
  // by COMMAND LINE and by this checkout's path — never by process name — and
  // only while no live session could own them.
  const strays = state.strayProcesses ?? []
  if (strays.length > 0 && !state.ownerAlive) {
    plan.push({
      action: 'kill-stray-verify-processes',
      level: 'repair',
      targets: strays.map((s) => s.pid),
      reason:
        `${strays.length} leftover process(es) of an aborted verification in THIS checkout ` +
        `(${strays.map((s) => `${s.pid} ${s.kind}`).join(', ')}), with no live session that could own them. ` +
        'They hold ports the next verify run needs and burn CPU until somebody notices.',
    })
  }

  // (e) A pending-spawn lock is a launcher's reservation that the spawned
  // session converts to itself. One that nobody converted, past its own stale
  // window and with a dead pid, reserves the batch against every future tick.
  if (state.stalePendingSpawn) {
    plan.push({
      action: 'clear-stale-pending-lock',
      level: 'repair',
      reason:
        `A pending-spawn lock (${state.stalePendingSpawn.sessionId}) has stood for ` +
        `${Math.round((state.stalePendingSpawn.ageMs ?? 0) / 60000)} min without a session converting it, and its process is gone. ` +
        'Until it is cleared, every launcher tick reads the batch as reserved and spawns nothing.',
    })
  }

  // (f) The board is the only thing the user can see while away, so a publish
  // that died between the local edit and the push is a silent blackout.
  if (state.boardBehind) {
    plan.push({
      action: 'republish-board',
      level: 'repair',
      reason:
        `The published board is behind the local one (${state.boardBehind.reason}). ` +
        'The reader on the phone sees a board that stands still; `node scripts/board-publish.mjs` re-runs the transport.',
    })
  }

  return plan
}

/** True when the plan requires a --repair run (any repair-level action). */
export function needsRepair(plan) {
  return plan.some((a) => a.level === 'repair')
}

/** True when the state is fully consistent (empty plan). */
export function isConsistent(plan) {
  return plan.length === 0
}

// ---------------------------------------------------------------------------
// THE REPAIR RUNS BEFORE THE SUCCESSOR, NOT AFTER THE DAMAGE (point 442)
// ---------------------------------------------------------------------------
//
// Everything above was, until 30.07.2026, a tool a session used IF it thought of
// it. Nothing called it on the way in: the launcher spawned a successor into
// whatever the previous session's death had left behind — a half-finished merge,
// a quarantine-worthy dirty tree — and the successor had to notice by itself.
// That is judgment where a mechanism belongs, and unattended it is judgment
// nobody is there to exercise.
//
// So the launcher runs the doctor before it spawns and this function decides what
// its exit code means. The doctor's codes: 0 consistent (or an inconclusive gate,
// which is no repo finding), 2 repairs planned but not executed, 1 findings that no
// mechanical repair clears.
//
// IT NEVER REFUSES TO SPAWN (four-eyes review, finding 1). The first draft did, and
// that was the mechanism making things WORSE than the status quo: an exit-1 state —
// a committed conflict marker, a repair blocked by a Windows file lock — is TRUE at
// every tick until somebody intervenes, so the batch would have stood still for the
// whole fortnight while pushing an urgent notification every fifteen minutes.
// Refusing to spawn also contradicts this change's other half: the mandate exists so
// that a SESSION can deal with an unclean tree, and a session is exactly the thing
// that can fix a mangled work order by hand. So findings mean "spawn, and tell it",
// never "spawn nothing", and the alert is throttled as the standing condition it is.
//
// FAIL-OPEN for the same reason. A doctor that cannot run — missing, crashed, timed
// out — must not become the one thing that stops the batch. It spawns and says so;
// a broken safeguard may cost a diagnosis, never the work.

/** Liveness verdicts under which the launcher may let the doctor WRITE. PURE.
 *
 *  Only where the previous owner is provably gone. `lease-expired` is deliberately
 *  NOT here (four-eyes review, finding 2): that verdict describes a process that is
 *  ALIVE and merely silent — the 30.07.2026 permission outage had exactly that
 *  shape — and it stands down at its next hook. Running `git merge --abort` or
 *  `git stash push -u` in its tree would discard the half-resolved merge it is
 *  sitting in. A read-only check plus the mandate is what such a tick gets. */
const REPAIR_SAFE_REASONS = new Set(['pid-dead', 'pid-reused', 'heartbeat-predates-boot', 'handed-over', 'no-lock', 'legacy-stale'])

/**
 * MAY THIS TICK LET THE DOCTOR WRITE? PURE.
 *
 * THE LEASE SHADOWS A PROVABLY DEAD PID (point 443 (g), four-eyes re-review of the
 * pre-spawn check). `assessOwner` tests the expired lease BEFORE it probes the pid,
 * so an owner that is BOTH dead and lease-expired — the machine slept, the launcher
 * was off for an hour, i.e. the likely shape of an unattended fortnight — reads
 * `lease-expired`, and the launcher then declined to mend its tree even though the
 * process was gone. The direction was safe (the successor still inherits the repair
 * through the mandate, so the batch never stopped), but it is a diagnosis lost for
 * nothing.
 *
 * So the lease-expired branch now asks the pid itself. `probe` is `probePid`'s
 * shape; `lock` supplies the recorded start time so PID REUSE counts as gone too —
 * a number inherited by a stranger's process is not the owner. An unprobed or
 * still-running pid keeps the read-only treatment, unchanged: the finding this
 * closes is the dead one, not the silent one.
 */
export function repoRepairAllowed(reason, { probe = null, lock = null } = {}) {
  const r = String(reason ?? '')
  if (REPAIR_SAFE_REASONS.has(r)) return true
  if (r !== 'lease-expired') return false
  return pidProvablyGone({ probe, lock })
}

/** Is the process behind a lock provably gone? PURE. Absent evidence means NO —
 *  an unreadable probe must never license a write into a live owner's tree. */
export function pidProvablyGone({ probe = null, lock = null } = {}) {
  const pid = typeof lock?.pid === 'number' && lock.pid > 0 ? lock.pid : null
  if (pid === null) return false // a legacy lock records no pid: nothing to prove
  if (!probe) return false
  if (probe.exists !== true) return true // the pid is gone
  // The pid exists but belongs to a DIFFERENT process (reuse) — the owner is gone
  // just as surely. The tolerance is batch-singleton's own PID_START_TOLERANCE_MS.
  return (
    typeof lock.pidStartedAt === 'number' &&
    typeof probe.startedAt === 'number' &&
    Math.abs(probe.startedAt - lock.pidStartedAt) > PID_START_TOLERANCE_MS
  )
}

/** Mirrors batch-singleton's constant. Duplicated rather than imported so this
 *  module stays pure and dependency-free; `scripts/batch-doctor-core.test.mjs`
 *  asserts the two agree. */
export const PID_START_TOLERANCE_MS = 2000

/** What the launcher does with the doctor's exit code before spawning. PURE.
 *
 *  `ran` false means the doctor could not be executed at all; `code` is its exit
 *  status; `repaired` says whether it was allowed to write. Returns
 *  `{ spawn, mandate, reason, alert, standing }` — `mandate` asks the spawned
 *  session to clean up first, `alert` is the notification text when one is
 *  warranted, and `standing` marks an alert that must be THROTTLED because the
 *  condition repeats every tick until somebody acts. */
export function repoRepairDecision({ ran = true, code = 0, repaired = false } = {}) {
  if (!ran) {
    return {
      spawn: true,
      mandate: false,
      reason: 'doctor-unrunnable',
      standing: true,
      alert:
        'The launcher could not run batch-doctor before spawning, so the successor was started WITHOUT a repo check. ' +
        'A safeguard that cannot run must not stop the batch — but it also proves nothing, so look at the machine.',
    }
  }
  const n = Number.isFinite(code) ? Number(code) : NaN
  if (n === 0) return { spawn: true, mandate: false, reason: 'consistent', standing: false, alert: null }
  const how = repaired
    ? 'The launcher ran batch-doctor --repair before spawning and findings REMAIN afterwards'
    : 'The launcher checked the repo before spawning (read-only — the previous owner is alive but silent, so nothing was mended for it) and found it unclean'
  return {
    spawn: true,
    mandate: true,
    reason: repaired ? 'findings-remain' : 'unclean-not-repaired',
    standing: true,
    alert:
      `${how}. The successor was started ANYWAY and carries the order to mend the tree before it works — ` +
      'a session can fix by hand what no mechanical repair clears, and refusing to start one would leave the batch ' +
      'standing still for as long as nobody is there.',
  }
}

/** The mandate a resuming session is given when the tree it woke up in is not
 *  clean (point 442, the other side of the seam). PURE — the hook only prints it. */
export function resumeRepairMandate({ ran = true, code = 0 } = {}) {
  if (!ran) return null // the launcher's own alert already carries that news
  if (Number.isFinite(code) && Number(code) === 0) return null
  return (
    'REPO NOT CLEAN — MEND IT BEFORE YOU WORK. The tree this session woke up in still carries findings from an ' +
    'interrupted session (batch-doctor exit ' +
    String(code) +
    '). FIRST run `node scripts/batch-doctor.mjs --repair` and follow its verdict; what no repair clears — a mangled ' +
    'work order, committed conflict markers — fix by hand, and only then continue the batch. Building on a torn tree ' +
    'is how one interrupted merge becomes a day of wrong work.'
  )
}

// ---------------------------------------------------------------------------
// THE MANDATE MARKER (point 442's seam, put under test by point 443 (h))
// ---------------------------------------------------------------------------
//
// The launcher leaves its doctor verdict in `.claude/repo-mandate.json` so the
// session it spawns seconds later need not re-run the check. Three mechanics
// keep that shortcut honest, and until 30.07.2026 all three lived in untested
// wiring inside scripts/batch-resume-hook.mjs:
//   ONE-SHOT   the marker is consumed by the first reader, readable or not — a
//              corrupt one used to throw past the deletion and be re-parsed at
//              every session start for ever.
//   EXPIRY     a marker older than the window describes a tree that has since
//              been worked in; it mandates nothing.
//   FALSE      a CLEAN tick deletes any marker a failed earlier tick left, so a
//              healthy successor is never handed "repo not clean".
// The consumption itself is in scripts/batch-doctor-states.mjs; this is the rule.

/** How long a launcher's verdict describes the tree a session wakes up in. */
export const MANDATE_MAX_AGE_MS = 15 * 60 * 1000

/**
 * What a marker's RAW BYTES mean. PURE — the caller has already deleted the file.
 *
 * Returns `{ verdict, ran, code }`: 'mandate' with the doctor's exit code, 'clean'
 * for a marker that recorded exit 0, or 'none' for absent/unreadable/expired — all
 * three of which mean "the launcher's verdict is unusable, ask the doctor yourself".
 * A marker with an unusable code counts as a FINDING (code 1), never as clean: the
 * launcher only ever writes one when it has something to say.
 */
export function mandateMarkerVerdict({ raw = null, now = Date.now(), maxAgeMs = MANDATE_MAX_AGE_MS } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return { verdict: 'none', ran: false, code: null }
  let m
  try {
    m = JSON.parse(raw)
  } catch {
    return { verdict: 'none', ran: false, code: null }
  }
  if (!m || !Number.isFinite(m.at) || now - m.at > maxAgeMs || now - m.at < 0) {
    return { verdict: 'none', ran: false, code: null }
  }
  const code = Number.isFinite(m.code) ? Number(m.code) : 1
  return code === 0 ? { verdict: 'clean', ran: true, code: 0 } : { verdict: 'mandate', ran: true, code }
}

// ---------------------------------------------------------------------------
// THE GATE MUST NOT BLAME THE CODE FOR THE LOAD (point 431, 29.07.2026)
// ---------------------------------------------------------------------------
//
// Three times in one afternoon the doctor declared the repo CONSISTENT and then
// reported `npm run test:unit FAILED — the concurrent writes (or the current
// head) broke it; fix before continuing the batch`. Each time the same suite,
// run standalone on the SAME commit minutes later, was fully green (170–172
// files, 4853–4903 tests). The gate had been competing with a delegated agent's
// build for the machine — the exact class the flake policy and retrospective
// §3.22/§3.48 describe, and the exact accusation they forbid: the message names
// the CODE as the suspect and orders the batch stopped.
//
// The fix is NOT to weaken the gate. The instrument already exists — the verify
// runner's quiet-machine check (point 296) — and the doctor now uses it. A red
// on a QUIET machine keeps today's wording, word for word. A red on a busy one,
// or with a live agent worktree, is INCONCLUSIVE: it names what was running and
// asks for a repeat once the pool is idle.

/** The commands `--gate` runs, in order. */
export const GATE_COMMANDS = ['npm run test:unit', 'npm run build', 'npm run lint']

/**
 * Is a verdict from this reading EVIDENCE? PURE.
 *
 * Only a measured-quiet machine with no live agent worktree qualifies. An
 * UNKNOWN reading is deliberately not evidence: the whole point of the quiet
 * check is that an unmeasured machine was believed once already.
 */
export function isEvidenceGrade({ level, agentWorktrees = [] } = {}) {
  return level === 'quiet' && (agentWorktrees?.length ?? 0) === 0
}

/** What was competing, in one clause — never a list of the user's windows. */
export function describeLoad({ level, reasons = [], agentWorktrees = [] } = {}) {
  const parts = []
  if ((agentWorktrees?.length ?? 0) > 0) {
    parts.push(`${agentWorktrees.length} live agent worktree(s): ${agentWorktrees.join(', ')}`)
  }
  const load = (reasons ?? []).filter(Boolean)
  if (load.length) parts.push(load.join('; '))
  if (!parts.length) parts.push(`the machine read as ${level ?? 'unknown'}`)
  return parts.join(' — ')
}

/**
 * THE GATE'S VERDICT. PURE.
 *
 * `results` is one entry per command actually run:
 *   { cmd, failed, level, reasons, agentWorktrees }
 * where `level`/`reasons`/`agentWorktrees` describe the machine DURING that
 * command, so a run that went quiet halfway is judged per command rather than
 * as a lump.
 *
 * Returns { broken, inconclusive, ordered, lines }:
 *   broken       — at least one failure on a quiet machine. Today's wording, and
 *                  today's stop order.
 *   inconclusive — a failure that only load can explain. NOT a stop order.
 *   ordered      — the failures, EVIDENCE FIRST. A reader must see which verdict
 *                  is evidence before the one that is not; the noisy line first
 *                  is how three afternoons were spent on the wrong suspect.
 */
export function judgeGateRun(results = []) {
  const all = Array.isArray(results) ? results : []
  const failures = all.filter((r) => r?.failed)
  const graded = failures.map((r) => ({ ...r, evidence: isEvidenceGrade(r) }))
  const ordered = [...graded].sort((a, b) => Number(b.evidence) - Number(a.evidence))
  const broken = graded.some((r) => r.evidence)
  const inconclusive = !broken && graded.length > 0

  const lines = ordered.map((r) =>
    r.evidence
      ? `gate: ${r.cmd} FAILED — the concurrent writes (or the current head) broke it; fix before continuing the batch`
      : `gate: ${r.cmd} FAILED but the verdict is INCONCLUSIVE (load) — ${describeLoad(r)}. ` +
        'A red under load is not evidence of a broken tree (retrospective §3.22/§3.48). ' +
        'Repeat the gate once the agent pool is idle; do NOT stop the batch on this.',
  )
  return { broken, inconclusive, ordered, lines }
}

/** The closing verdict line for a gate run that failed only under load. */
export const INCONCLUSIVE_VERDICT =
  'VERDICT: the repo state is consistent; the gate could not be judged (the machine was not quiet). ' +
  'Repeat `node scripts/batch-doctor.mjs --gate` once the agent pool is idle. The batch continues.'

// ---------------------------------------------------------------------------
// THE DEMAND IS SATISFIED BY A STATE, NOT BY A TURN (point 431, second half)
// ---------------------------------------------------------------------------
//
// The Stop hook fired the gate EVERY turn while the other session merely
// existed, and the gate costs ~3 minutes of unit tests each time. What is being
// judged is the STATE — this HEAD, beside these parallel sessions — so once a
// run has reported it consistent, the demand holds until one of the two changes.

/** The key a satisfaction is recorded under. PURE, and order-insensitive: the
 *  same two sessions in a different order are the same situation. */
export function gateKey({ head = '', parallelSids = [] } = {}) {
  const sids = [...new Set((parallelSids ?? []).filter(Boolean).map(String))].sort()
  return `${String(head ?? '').trim()}|${sids.join(',')}`
}

/**
 * Has a doctor run already cleared THIS state? PURE.
 *
 * `state` is the persisted doctor state; `satisfiedGate` is the key it recorded.
 * An empty head never satisfies anything — an unreadable git state must not be
 * able to switch the demand off.
 */
export function gateDemandSatisfied({ state, head, parallelSids = [] } = {}) {
  const key = gateKey({ head, parallelSids })
  if (!String(head ?? '').trim()) return false
  return typeof state?.satisfiedGate === 'string' && state.satisfiedGate === key
}

/**
 * May THIS doctor run record the satisfaction? PURE.
 *
 * Only a run that ACTUALLY ran the gate and got a judgeable green may. A run
 * without `--gate` never ran the suites; a red is a finding; and an INCONCLUSIVE
 * red must not switch the demand off either — otherwise a busy machine would
 * silently buy a pass, which is the mirror image of the bug this point fixes.
 */
export function shouldRecordSatisfaction({
  gateRan = false,
  broken = false,
  inconclusive = false,
  pendingRepair = false,
} = {}) {
  return !!gateRan && !broken && !inconclusive && !pendingRepair
}

// ---------------------------------------------------------------------------
// AN ALERT MUST NAME SOMEONE ELSE (point 431, third half)
// ---------------------------------------------------------------------------
//
// Twice in one evening the Stop hook reported "PARALLEL SESSION DETECTED
// (10a2d2e0…)" — and that id was the id of the very session it was warning, the
// one holding the lock. The live detector already excludes the owner, but the
// alert is a FILE: it is written by whoever notices (a launcher tick, another
// window) and read back later, by which time the session it names may be the
// reader. So the whole ritual — a three-minute gate, a doctor run, a re-check of
// board and work order — was ordered because a session had seen ITSELF.
//
// An alert that cannot say who else was there is not evidence of anyone else
// being there.

/**
 * The OTHER sessions an alert names. PURE. Returns [] when the alert names
 * nobody but the reader (or the owner), which means there is nothing to act on.
 */
export function otherSessionsIn({ alert, readerSid = '', ownerSid = '' } = {}) {
  const mine = new Set([readerSid, ownerSid].filter(Boolean).map(String))
  const listed = Array.isArray(alert?.parallel) ? alert.parallel : []
  const out = []
  for (const entry of listed) {
    const sid = typeof entry === 'string' ? entry : entry?.sid
    if (!sid || mine.has(String(sid))) continue
    if (!out.includes(String(sid))) out.push(String(sid))
  }
  return out
}

/** Is this alert evidence of a second writer? PURE. */
export const alertNamesAnother = (args) => otherSessionsIn(args).length > 0
