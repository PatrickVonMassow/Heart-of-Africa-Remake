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
 * }
 * Returns an ordered list of actions:
 *   { action, level: 'auto' | 'repair' | 'alert', reason }
 * 'auto'   — safe, run on every doctor invocation
 * 'repair' — destructive-looking (still fully recoverable), runs only with --repair
 * 'alert'  — cannot be fixed mechanically; report loudly
 */
export function planRemediation(state) {
  const plan = []
  const div = state.divergence ?? { ahead: 0, behind: 0 }

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

  if (!state.tasksParses) {
    plan.push({
      action: 'alert-tasks-format',
      level: 'alert',
      reason: 'TASKS.md checkboxes no longer parse — a concurrent edit may have mangled the work order. Fix by hand; never read this as "batch complete".',
    })
  }

  if (state.conflictMarkers) {
    plan.push({
      action: 'alert-conflict-markers',
      level: 'alert',
      reason: 'Tracked files contain conflict markers (<<<<<<<) — a conflicted merge was committed or left unresolved. Inspect and fix by hand.',
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
// So the launcher runs `batch-doctor.mjs --repair` before it spawns and this
// function decides what its exit code means. The doctor's codes: 0 consistent
// (or an inconclusive gate, which is not a repo finding), 2 repairs planned but
// not executed, 1 findings that no mechanical repair can clear.
//
// FAIL-OPEN, deliberately. A doctor that cannot run — missing, crashed, node
// itself unhappy — must not become the one thing that stops the batch for a
// fortnight. An unrunnable doctor SPAWNS and says so loudly; that is the same
// choice every guard in this project makes, for the same reason: a broken
// safeguard may cost a diagnosis, never the work.

/** What the launcher does with the doctor's exit code before spawning. PURE.
 *
 *  `ran` false means the doctor could not be executed at all. `code` is its exit
 *  status. Returns `{ spawn, reason, alert }` — `alert` is the notification text
 *  when one is warranted, else null. */
export function repoRepairDecision({ ran = true, code = 0 } = {}) {
  if (!ran) {
    return {
      spawn: true,
      reason: 'doctor-unrunnable',
      alert:
        'The launcher could not run batch-doctor before spawning, so the successor was started WITHOUT a repo check. ' +
        'A safeguard that cannot run must not stop the batch — but it also proves nothing, so look at the machine.',
    }
  }
  const n = Number.isFinite(code) ? Number(code) : NaN
  if (n === 0) return { spawn: true, reason: 'consistent', alert: null }
  if (n === 2) {
    return {
      spawn: false,
      reason: 'repairs-pending',
      alert:
        'The launcher ran batch-doctor --repair before spawning and repairs are STILL pending afterwards. ' +
        'Nothing was started: a successor inheriting a torn tree is how a bad state gets built upon. Retrying next tick.',
    }
  }
  return {
    spawn: false,
    reason: 'findings-remain',
    alert:
      'The launcher ran batch-doctor before spawning and findings remain that no mechanical repair clears — ' +
      'a mangled work order or committed conflict markers. Nothing was started; this needs hands. Retrying next tick.',
  }
}

/** The mandate a resuming session is given when the tree it woke up in is not
 *  clean (point 442, the other side of the seam). PURE — the hook only prints it. */
export function resumeRepairMandate({ ran = true, code = 0 } = {}) {
  const d = repoRepairDecision({ ran, code })
  if (d.reason === 'consistent' || d.reason === 'doctor-unrunnable') return null
  return (
    'REPO NOT CLEAN — DO NOT START WORKING. The tree this session woke up in still carries findings from an ' +
    'interrupted session (batch-doctor exit ' +
    String(code) +
    '). FIRST run `node scripts/batch-doctor.mjs --repair` and follow its verdict; only when it reports ' +
    '"consistent" may the batch continue. Building on a torn tree is how one interrupted merge becomes a day of ' +
    'wrong work.'
  )
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
